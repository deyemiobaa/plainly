import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  absoluteBillPath,
  getDocument,
  readDigest,
  writeDigest,
} from "@/lib/documents";
import { extractDocumentPages } from "@/lib/extract";
import { detectSections, type DetectedSection } from "@/lib/sections";
import type { DigestSection, DocumentDigest, Topic } from "@/lib/types";

const MODEL = "gemini-3.8-flash";
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000];

export type ProcessLogEvent = {
  type: "info" | "retry" | "error" | "complete";
  message: string;
  ts: string;
};

export class MissingApiKeyError extends Error {
  constructor() {
    super("Add a GEMINI_API_KEY in .env.local to process a document.");
    this.name = "MissingApiKeyError";
  }
}

export class DocumentNotFoundError extends Error {
  constructor(slug: string) {
    super(`No document found for "${slug}".`);
    this.name = "DocumentNotFoundError";
  }
}

const topicSchema = z.object({
  title: z.string(),
  plain_summary: z.string(),
  why_it_matters: z.string().optional(),
  who_is_affected: z.array(z.string()).optional(),
  key_changes: z.array(z.string()).optional(),
  what_is_not_changing: z.array(z.string()).optional(),
  effective_date: z.string().nullable().optional(),
  source_references: z
    .array(
      z.object({
        pages: z.string(),
        section: z.string().optional(),
      }),
    )
    .optional(),
});

const sectionTopicsSchema = z.object({
  topics: z.array(topicSchema),
});

type LogFn = (event: Omit<ProcessLogEvent, "ts">) => void;

function apiKey() {
  return process.env.GEMINI_API_KEY;
}

function jsonSchema() {
  const schema = z.toJSONSchema(sectionTopicsSchema) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    error?: { code?: unknown; status?: unknown };
  };

  for (const value of [
    record.status,
    record.statusCode,
    record.code,
    record.error?.code,
    record.error?.status,
  ]) {
    if (typeof value === "number") {
      return value;
    }
  }

  return undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRetryable(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return true;
  }

  const status = errorStatus(error);
  if (status === 429 || status === 500 || status === 503) {
    return true;
  }

  return /503|429|UNAVAILABLE|high demand|resource exhausted|try again later|overloaded|returned no text/i.test(
    errorMessage(error),
  );
}

async function withRetry<T>(
  label: string,
  log: LogFn,
  run: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const canRetry =
        isRetryable(error) && attempt < RETRY_DELAYS_MS.length;

      if (!canRetry) {
        throw error;
      }

      const waitMs = RETRY_DELAYS_MS[attempt];
      log({
        type: "retry",
        message: `${label} · ${errorMessage(error)} · retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${waitMs / 1000}s`,
      });
      await sleep(waitMs);
    }
  }

  throw lastError;
}

function fallbackTopic(section: DetectedSection): Topic {
  if (section.id === "appendices") {
    return {
      title: "Detailed tables and appendices",
      plain_summary:
        "The rest of the document is statistical tables and annexes that back up figures used earlier. They do not usually introduce new policy on their own.",
      why_it_matters:
        "Use these pages if you need the exact numbers behind a claim in an earlier section.",
      source_references: [
        {
          pages: `${section.startPage}-${section.endPage}`,
          section: section.heading,
        },
      ],
    };
  }

  return {
    title: section.title,
    plain_summary:
      "This part of the document is front matter (cover, contents, or lists) rather than policy itself.",
    source_references: [
      {
        pages: `${section.startPage}-${section.endPage}`,
        section: section.heading,
      },
    ],
  };
}

function ensureTopics(section: DetectedSection, topics: Topic[]): Topic[] {
  if (topics.length > 0) {
    return topics;
  }

  return [
    {
      title: section.title,
      plain_summary:
        "This chapter did not contain a distinct public-facing policy change.",
      source_references: [
        {
          pages: `${section.startPage}-${section.endPage}`,
          section: section.heading,
        },
      ],
    },
  ];
}

async function summarizeSection(
  section: DetectedSection,
  documentTitle: string,
  client: GoogleGenAI,
): Promise<Topic[]> {
  if (section.skipLlm || !section.text.trim()) {
    return [fallbackTopic(section)];
  }

  const interaction = await client.interactions.create({
    model: MODEL,
    store: false,
    service_tier: "flex",
    system_instruction: `You explain policy documents to the public.

Rules:
- Only use information in this section. Do not invent numbers, dates, or laws.
- Skip ceremonial greetings, applause lines, and repeated slogans.
- Split the section into distinct topics the public can scan. A long chapter may yield several topics. A speechy chapter may yield one, or none.
- Prefer concrete money, taxes, programmes, dates, and obligations.
- who_is_affected should be ordinary groups (students, traders, farmers, workers, patients), not ministries unless that is the point.
- source_references.pages must be page numbers from the "--- Page N ---" markers in the text, like "120-124" or "157".
- source_references.section should be the chapter heading you were given.
- Omit a field rather than guessing. effective_date can be a year or a phrase if no calendar date is given.
- Write at a grade-school reading level.`,
    input: `Document: ${documentTitle}
Chapter: ${section.heading}
PDF pages: ${section.startPage}-${section.endPage}

Extract the public-facing topics in this chapter.

${section.text}`,
    response_format: [
      {
        type: "text",
        mime_type: "application/json",
        schema: jsonSchema(),
      },
    ],
  });

  if (!interaction.output_text) {
    throw new Error(`Gemini returned no text for ${section.heading}.`);
  }

  const parsed = sectionTopicsSchema.parse(JSON.parse(interaction.output_text));

  return parsed.topics.map((topic) => ({
    ...topic,
    source_references:
      topic.source_references && topic.source_references.length > 0
        ? topic.source_references
        : [
            {
              pages: `${section.startPage}-${section.endPage}`,
              section: section.heading,
            },
          ],
  }));
}

export async function processDocument({
  slug,
  fresh = false,
  onLog,
}: {
  slug: string;
  fresh?: boolean;
  onLog?: (event: ProcessLogEvent) => void;
}): Promise<DocumentDigest> {
  const log: LogFn = (event) => {
    onLog?.({ ...event, ts: new Date().toISOString() });
  };

  const bill = await getDocument(slug);
  if (!bill) {
    throw new DocumentNotFoundError(slug);
  }

  const key = apiKey();
  if (!key) {
    throw new MissingApiKeyError();
  }

  log({ type: "info", message: `Extracting ${bill.filename}…` });
  const pages = await extractDocumentPages(absoluteBillPath(bill.filename));
  log({
    type: "info",
    message: `Extracted ${pages.length} pages.`,
  });

  const sections = detectSections(pages);
  if (sections.length === 0) {
    throw new Error("Could not extract any text from this document.");
  }

  const llmCount = sections.filter((section) => !section.skipLlm).length;
  const skippedCount = sections.length - llmCount;
  log({
    type: "info",
    message: `Found ${sections.length} chapters (${llmCount} to send to Gemini, ${skippedCount} skipped).`,
  });

  const existing = fresh ? null : await readDigest(slug);
  const doneByHeading = new Map(
    existing?.sections.map((section) => [section.heading, section]) ?? [],
  );

  if (existing && doneByHeading.size > 0) {
    log({
      type: "info",
      message: `Resuming from saved digest (${doneByHeading.size} chapter(s) already stored).`,
    });
  }

  const client = new GoogleGenAI({ apiKey: key });
  const digestSections: DigestSection[] = [];

  const digest: DocumentDigest = {
    document: {
      slug: bill.slug,
      title: bill.title,
      source_file: bill.file,
      processed_at: new Date().toISOString(),
      model: MODEL,
    },
    sections: digestSections,
  };

  for (const [index, section] of sections.entries()) {
    const label = `${index + 1}/${sections.length} ${section.heading} · pp. ${section.startPage}–${section.endPage}`;
    const saved = doneByHeading.get(section.heading);

    if (saved && saved.topics.length > 0) {
      digestSections.push(saved);
      log({ type: "info", message: `${label} · already saved, skipping.` });
      continue;
    }

    if (section.skipLlm || !section.text.trim()) {
      log({ type: "info", message: `${label} · skipped (no Gemini call).` });
    } else {
      log({ type: "info", message: `${label} · calling Gemini…` });
    }

    const started = Date.now();
    const topics = ensureTopics(
      section,
      await withRetry(label, log, () =>
        summarizeSection(section, bill.title, client),
      ),
    );
    const elapsedSec = Math.max(1, Math.round((Date.now() - started) / 1000));

    digestSections.push({
      title: section.title,
      heading: section.heading,
      pages: `${section.startPage}-${section.endPage}`,
      startPage: section.startPage,
      endPage: section.endPage,
      topics,
    });

    digest.document.processed_at = new Date().toISOString();
    await writeDigest(slug, digest);

    if (!section.skipLlm && section.text.trim()) {
      log({
        type: "info",
        message: `${label} · ${topics.length} topic(s) in ${elapsedSec}s. Saved.`,
      });
    }
  }

  await writeDigest(slug, digest);
  log({
    type: "complete",
    message: `Digest saved with ${digestSections.reduce((count, section) => count + section.topics.length, 0)} topics.`,
  });
  return digest;
}

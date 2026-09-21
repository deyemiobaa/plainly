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
import type {
  DigestSection,
  DocumentDigest,
  ProcessLogEvent,
  Topic,
} from "@/lib/types";

export type { ProcessLogEvent } from "@/lib/types";

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const OPENAI_MODEL = "gpt-4o-mini";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000];

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "Add a GEMINI_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY in .env.local to process a document.",
    );
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

function geminiKey() {
  return process.env.GEMINI_API_KEY;
}

function openaiKey() {
  return process.env.OPENAI_API_KEY;
}

function groqKey() {
  return process.env.GROQ_API_KEY;
}

const SYSTEM_INSTRUCTION = `You turn policy documents into summaries the average person can understand.
Rules:
- Only use information in this section. Do not invent numbers, dates, or laws.
- Skip ceremonial greetings, applause lines, wordy or lengthy legal jargon, and repeated slogans.
- Split the section into distinct topics the public can scan. A long chapter may yield several topics. A speechy chapter may yield one, or none.
- plain_summary should proioritize touching on the impact of the section. what is changing, who is affected, and why it matters.
- Prefer concrete money, taxes, programmes, dates, and obligations..
- who_is_affected should be groups (students, traders, farmers, workers, patients, etc), not ministries unless that is the point. Keep the casing and taxonomy consistent, for example "small businesses" and "small and micro businesses" can be regarded as "small businesses". use the most common or relevant terms. stick to title case.
- when writing why_it_matters, focus on the impact on the average person or group of people. This section should strictly contain NOT more than 200 words.
- key_changes should be be a direct quote from the section. Do not make up or invent changes. Rather paraphrase the change in words let the affected persons or group understand the change.
- source_references.pages must be page numbers from the "--- Page N ---" markers in the text, like "120-124" or "157".
- source_references.section should be the chapter heading you were given.
- Omit a field rather than guessing. effective_date can be a year or a phrase if no calendar date is given.
- Write at a grade-school reading level.
- Respond with JSON of the form { "topics": [ ... ] }.`;

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

function userPrompt(section: DetectedSection, documentTitle: string) {
  return `Document: ${documentTitle}
Chapter: ${section.heading}
PDF pages: ${section.startPage}-${section.endPage}

Extract the public-facing topics in this chapter.

${section.text}`;
}

function topicsFromJson(raw: string, section: DetectedSection): Topic[] {
  const parsed = sectionTopicsSchema.parse(JSON.parse(raw));

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

function isPriorityUnavailable(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    errorStatus(error) === 400 &&
    /service_tier|priority|INVALID_ARGUMENT/i.test(message)
  );
}

async function summarizeWithGemini(
  section: DetectedSection,
  documentTitle: string,
  client: GoogleGenAI,
  serviceTier?: "priority",
): Promise<Topic[]> {
  const interaction = await client.interactions.create({
    model: GEMINI_MODEL,
    store: false,
    ...(serviceTier ? { service_tier: serviceTier } : {}),
    system_instruction: SYSTEM_INSTRUCTION,
    input: userPrompt(section, documentTitle),
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

  return topicsFromJson(interaction.output_text, section);
}

async function summarizeWithOpenAICompatible({
  baseUrl,
  apiKey,
  model,
  section,
  documentTitle,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  section: DetectedSection;
  documentTitle: string;
}): Promise<Topic[]> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: userPrompt(section, documentTitle) },
      ],
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    const error = new Error(`${response.status} ${body.slice(0, 400)}`);
    (error as { status?: number }).status = response.status;
    throw error;
  }

  const payload = JSON.parse(body) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`${model} returned no text for ${section.heading}.`);
  }

  return topicsFromJson(content, section);
}

async function summarizeSection(
  section: DetectedSection,
  documentTitle: string,
  client: GoogleGenAI | null,
  log: LogFn,
  label: string,
  modelsUsed: Set<string>,
): Promise<Topic[]> {
  if (section.skipLlm || !section.text.trim()) {
    return [fallbackTopic(section)];
  }

  if (client && geminiKey()) {
    let geminiError: unknown;
    try {
      const topics = await withRetry(
        `${label} · ${GEMINI_MODEL} (priority)`,
        log,
        () => summarizeWithGemini(section, documentTitle, client, "priority"),
      );
      modelsUsed.add(GEMINI_MODEL);
      return topics;
    } catch (error) {
      geminiError = error;
    }

    if (isPriorityUnavailable(geminiError)) {
      log({
        type: "retry",
        message: `${label} · priority unavailable, retrying Gemini on standard.`,
      });
      try {
        const topics = await withRetry(`${label} · ${GEMINI_MODEL}`, log, () =>
          summarizeWithGemini(section, documentTitle, client),
        );
        modelsUsed.add(GEMINI_MODEL);
        return topics;
      } catch (error) {
        geminiError = error;
      }
    }

    const openai = openaiKey();
    const groq = groqKey();
    if (!isRetryable(geminiError) || (!openai && !groq)) {
      throw geminiError;
    }

    log({
      type: "retry",
      message: `${label} · Gemini still unavailable (${errorMessage(geminiError)}). Switching fallback.`,
    });
  }

  const openai = openaiKey();
  if (openai) {
    const topics = await withRetry(`${label} · ${OPENAI_MODEL}`, log, () =>
      summarizeWithOpenAICompatible({
        baseUrl: "https://api.openai.com/v1",
        apiKey: openai,
        model: OPENAI_MODEL,
        section,
        documentTitle,
      }),
    );
    modelsUsed.add(OPENAI_MODEL);
    return topics;
  }

  const groq = groqKey();
  if (groq) {
    const topics = await withRetry(`${label} · ${GROQ_MODEL}`, log, () =>
      summarizeWithOpenAICompatible({
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: groq,
        model: GROQ_MODEL,
        section,
        documentTitle,
      }),
    );
    modelsUsed.add(GROQ_MODEL);
    return topics;
  }

  throw new MissingApiKeyError();
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
  const processLog: ProcessLogEvent[] = [];
  const log: LogFn = (event) => {
    const full: ProcessLogEvent = { ...event, ts: new Date().toISOString() };
    processLog.push(full);
    onLog?.(full);
  };

  const bill = await getDocument(slug);
  if (!bill) {
    throw new DocumentNotFoundError(slug);
  }

  const key = geminiKey();
  if (!key && !openaiKey() && !groqKey()) {
    throw new MissingApiKeyError();
  }

  const fallbacks = [
    openaiKey() ? OPENAI_MODEL : null,
    groqKey() ? GROQ_MODEL : null,
  ].filter((model): model is string => Boolean(model));
  log({
    type: "info",
    message: key
      ? `Using ${GEMINI_MODEL} (priority)${fallbacks.length ? `; fallback ${fallbacks.join(", ")}` : ""}.`
      : `Gemini key missing. Using fallback ${fallbacks.join(", ")}.`,
  });

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
    message: `Found ${sections.length} chapters (${llmCount} to send to the model, ${skippedCount} skipped).`,
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

  const client = key ? new GoogleGenAI({ apiKey: key }) : null;
  const modelsUsed = new Set<string>();
  const digestSections: DigestSection[] = [];

  const digest: DocumentDigest = {
    document: {
      slug: bill.slug,
      title: bill.title,
      source_file: bill.file,
      processed_at: new Date().toISOString(),
      model: GEMINI_MODEL,
    },
    process_log: processLog,
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
      log({ type: "info", message: `${label} · skipped (no model call).` });
    } else {
      log({ type: "info", message: `${label} · calling model…` });
    }

    const started = Date.now();
    const topics = ensureTopics(
      section,
      await summarizeSection(
        section,
        bill.title,
        client,
        log,
        label,
        modelsUsed,
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
    digest.document.model = [...modelsUsed].join(", ") || GEMINI_MODEL;
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

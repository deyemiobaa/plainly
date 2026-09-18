import { createGoogle } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  absoluteBillPath,
  getDocument,
  writeDigest,
} from "@/lib/documents";
import { extractDocumentPages } from "@/lib/extract";
import { detectSections, type DetectedSection } from "@/lib/sections";
import type { DocumentDigest, Topic } from "@/lib/types";

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

function apiKey() {
  return process.env.GEMINI_API_KEY;
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

async function summarizeSection(
  section: DetectedSection,
  documentTitle: string,
  google: ReturnType<typeof createGoogle>,
): Promise<Topic[]> {
  if (section.skipLlm || !section.text.trim()) {
    return [fallbackTopic(section)];
  }

  const { output } = await generateText({
    model: google("gemini-3.6-flash"),
    output: Output.object({
      schema: sectionTopicsSchema,
      name: "SectionTopics",
      description:
        "Concrete policy or budget topics found in one chapter of a public document.",
    }),
    system: `You explain policy documents to the public.

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
    prompt: `Document: ${documentTitle}
Chapter: ${section.heading}
PDF pages: ${section.startPage}-${section.endPage}

Extract the public-facing topics in this chapter.

${section.text}`,
  });

  return output.topics.map((topic) => ({
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

export async function processDocument(slug: string): Promise<DocumentDigest> {
  const bill = await getDocument(slug);
  if (!bill) {
    throw new DocumentNotFoundError(slug);
  }

  const key = apiKey();
  if (!key) {
    throw new MissingApiKeyError();
  }

  const pages = await extractDocumentPages(absoluteBillPath(bill.filename));
  const sections = detectSections(pages);

  if (sections.length === 0) {
    throw new Error("Could not extract any text from this document.");
  }

  const google = createGoogle({ apiKey: key });
  const digestSections: DocumentDigest["sections"] = [];

  for (const section of sections) {
    const topics = await summarizeSection(section, bill.title, google);
    digestSections.push({
      title: section.title,
      heading: section.heading,
      pages: `${section.startPage}-${section.endPage}`,
      startPage: section.startPage,
      endPage: section.endPage,
      topics:
        topics.length > 0
          ? topics
          : [
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
            ],
    });
  }

  const digest: DocumentDigest = {
    document: {
      slug: bill.slug,
      title: bill.title,
      source_file: bill.file,
      processed_at: new Date().toISOString(),
      model: "gemini-2.5-flash",
    },
    sections: digestSections,
  };

  await writeDigest(slug, digest);
  return digest;
}

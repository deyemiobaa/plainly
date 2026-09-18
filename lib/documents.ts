import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { documentMeta } from "@/data/bills";
import type { Bill, DocumentDigest } from "@/lib/types";

const BILLS_DIR = path.join(process.cwd(), "public", "bills");
const SUMMARIES_DIR = path.join(process.cwd(), "data", "summaries");
const SUPPORTED = /\.(pdf|md|txt)$/i;

export function slugFromFilename(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

function titleFromFilename(filename: string) {
  return slugFromFilename(filename).replace(/[-_]+/g, " ");
}

function summaryPath(slug: string) {
  return path.join(SUMMARIES_DIR, `${slug}.json`);
}

export function absoluteBillPath(filename: string) {
  return path.join(BILLS_DIR, filename);
}

export async function readDigest(slug: string): Promise<DocumentDigest | null> {
  try {
    const raw = await readFile(summaryPath(slug), "utf8");
    return JSON.parse(raw) as DocumentDigest;
  } catch {
    return null;
  }
}

export async function writeDigest(slug: string, digest: DocumentDigest) {
  await mkdir(SUMMARIES_DIR, { recursive: true });
  await writeFile(
    summaryPath(slug),
    `${JSON.stringify(digest, null, 2)}\n`,
    "utf8",
  );
}

export async function listDocuments(): Promise<Bill[]> {
  let filenames: string[] = [];

  try {
    filenames = (await readdir(BILLS_DIR)).filter((name) => SUPPORTED.test(name));
  } catch {
    return [];
  }

  const bills = await Promise.all(
    filenames.map(async (filename) => {
      const slug = slugFromFilename(filename);
      const digest = await readDigest(slug);
      const meta = documentMeta[slug] ?? {};
      const topicCount = digest?.sections.reduce(
        (count, section) => count + section.topics.length,
        0,
      );

      return {
        slug,
        filename,
        file: `/bills/${filename}`,
        title: meta.title ?? digest?.document.title ?? titleFromFilename(filename),
        date: meta.date,
        teaser: meta.teaser,
        hasDigest: Boolean(digest),
        processedAt: digest?.document.processed_at,
        topicCount,
      } satisfies Bill;
    }),
  );

  return bills.sort((a, b) => a.title.localeCompare(b.title));
}

export async function getDocument(slug: string): Promise<Bill | undefined> {
  const bills = await listDocuments();
  return bills.find((bill) => bill.slug === slug);
}

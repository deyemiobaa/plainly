import type { DocumentPage } from "@/lib/extract";

export type DetectedSection = {
  id: string;
  heading: string;
  title: string;
  startPage: number;
  endPage: number;
  text: string;
  skipLlm: boolean;
};

const MAJOR_HEADING =
  /^(SECTION|CHAPTER|PART)\s+([0-9IVXLC]+|[A-Z]+)\s*[:.\-–—]\s*(.*)$/i;
const APPENDIX_HEADING = /^(APPENDIX|ANNEX(?:URE)?)\b/i;
const NUMBERED_PARAGRAPH = /^\d+\.\s/;
const TOC_DOTS = /\.{4,}/;
const MAX_SECTION_CHARS = 180_000;
const PAGE_CHUNK_SIZE = 20;

function isTitleContinuation(line: string) {
  if (!line || NUMBERED_PARAGRAPH.test(line) || MAJOR_HEADING.test(line)) {
    return false;
  }

  if (line.length > 90) {
    return false;
  }

  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) {
    return false;
  }

  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length >= 0.7;
}

function collectHeadings(pages: DocumentPage[]) {
  const found: {
    id: string;
    heading: string;
    title: string;
    page: number;
  }[] = [];

  for (const page of pages) {
    const lines = page.text.split("\n").map((line) => line.trim());

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line || TOC_DOTS.test(line)) {
        continue;
      }

      const match = line.match(MAJOR_HEADING);
      if (!match) {
        continue;
      }

      const kind = match[1].toLowerCase();
      const number = match[2].toLowerCase();
      let title = (match[3] ?? "").trim();
      const next = lines[i + 1]?.trim() ?? "";
      if (isTitleContinuation(next)) {
        title = `${title} ${next}`.trim();
      }

      const heading = title ? `${match[1]} ${match[2]}: ${title}` : line;

      found.push({
        id: `${kind}-${number}`,
        heading,
        title: title || heading,
        page: page.pageNumber,
      });
    }
  }

  const lastById = new Map<string, (typeof found)[number]>();
  for (const heading of found) {
    lastById.set(heading.id, heading);
  }

  return [...lastById.values()].sort((a, b) => a.page - b.page);
}

function firstAppendixPage(pages: DocumentPage[], afterPage: number) {
  for (const page of pages) {
    if (page.pageNumber <= afterPage) {
      continue;
    }

    const lines = page.text.split("\n").map((line) => line.trim());
    if (
      lines.some(
        (line) => APPENDIX_HEADING.test(line) && !TOC_DOTS.test(line),
      )
    ) {
      return page.pageNumber;
    }
  }

  return null;
}

function pagesToText(
  pages: DocumentPage[],
  startPage: number,
  endPage: number,
) {
  const chunk = pages.filter(
    (page) => page.pageNumber >= startPage && page.pageNumber <= endPage,
  );

  let text = chunk
    .map((page) => `--- Page ${page.pageNumber} ---\n${page.text}`)
    .join("\n\n");

  if (text.length > MAX_SECTION_CHARS) {
    text = `${text.slice(0, MAX_SECTION_CHARS)}\n\n[Section truncated for length.]`;
  }

  return text;
}

function fallbackChunks(pages: DocumentPage[]): DetectedSection[] {
  const sections: DetectedSection[] = [];

  for (let i = 0; i < pages.length; i += PAGE_CHUNK_SIZE) {
    const slice = pages.slice(i, i + PAGE_CHUNK_SIZE);
    const startPage = slice[0].pageNumber;
    const endPage = slice[slice.length - 1].pageNumber;
    const index = sections.length + 1;

    sections.push({
      id: `pages-${startPage}-${endPage}`,
      heading: `Pages ${startPage}–${endPage}`,
      title: `Part ${index}`,
      startPage,
      endPage,
      text: pagesToText(pages, startPage, endPage),
      skipLlm: false,
    });
  }

  return sections;
}

export function detectSections(pages: DocumentPage[]): DetectedSection[] {
  const usablePages = pages.filter((page) => page.text.length > 0);
  if (usablePages.length === 0) {
    return [];
  }

  const headings = collectHeadings(usablePages);
  if (headings.length === 0) {
    return fallbackChunks(usablePages);
  }

  const lastPage = usablePages[usablePages.length - 1].pageNumber;
  const sections: DetectedSection[] = [];

  if (headings[0].page > usablePages[0].pageNumber) {
    const startPage = usablePages[0].pageNumber;
    const endPage = headings[0].page - 1;
    sections.push({
      id: "front-matter",
      heading: "Front matter",
      title: "Front matter",
      startPage,
      endPage,
      text: pagesToText(usablePages, startPage, endPage),
      skipLlm: true,
    });
  }

  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i];
    const next = headings[i + 1];
    const endPage = next ? next.page - 1 : lastPage;

    sections.push({
      id: current.id,
      heading: current.heading,
      title: current.title,
      startPage: current.page,
      endPage,
      text: pagesToText(usablePages, current.page, endPage),
      skipLlm: false,
    });
  }

  const lastSection = sections[sections.length - 1];
  const appendixStart = firstAppendixPage(usablePages, headings[0].page);

  if (
    appendixStart &&
    lastSection &&
    appendixStart > lastSection.startPage &&
    appendixStart <= lastSection.endPage
  ) {
    lastSection.endPage = appendixStart - 1;
    lastSection.text = pagesToText(
      usablePages,
      lastSection.startPage,
      lastSection.endPage,
    );

    sections.push({
      id: "appendices",
      heading: "Appendices",
      title: "Appendices",
      startPage: appendixStart,
      endPage: lastPage,
      text: "",
      skipLlm: true,
    });
  }

  return sections;
}

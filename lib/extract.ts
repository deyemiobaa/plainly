import { readFile } from "node:fs/promises";
import { extractText } from "unpdf";

export type DocumentPage = {
  pageNumber: number;
  text: string;
};

export async function extractDocumentPages(
  filePath: string,
): Promise<DocumentPage[]> {
  if (filePath.toLowerCase().endsWith(".pdf")) {
    const buffer = await readFile(filePath);
    const { text } = await extractText(new Uint8Array(buffer), {
      mergePages: false,
    });

    return text.map((pageText, index) => ({
      pageNumber: index + 1,
      text: pageText.replace(/\r/g, "").trim(),
    }));
  }

  const text = await readFile(filePath, "utf8");
  return [{ pageNumber: 1, text }];
}

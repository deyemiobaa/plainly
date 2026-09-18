import {
  DocumentNotFoundError,
  MissingApiKeyError,
  processDocument,
} from "@/lib/summarize";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    const digest = await processDocument(slug);
    return Response.json({ digest });
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof MissingApiKeyError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    const message =
      error instanceof Error ? error.message : "Failed to process document.";
    return Response.json({ error: message }, { status: 500 });
  }
}

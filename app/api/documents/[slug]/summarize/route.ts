import {
  DocumentNotFoundError,
  MissingApiKeyError,
  processDocument,
  type ProcessLogEvent,
} from "@/lib/summarize";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProcessLogEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      try {
        await processDocument({
          slug,
          fresh,
          onLog: send,
        });
      } catch (error) {
        if (error instanceof DocumentNotFoundError) {
          send({
            type: "error",
            message: error.message,
            ts: new Date().toISOString(),
          });
        } else if (error instanceof MissingApiKeyError) {
          send({
            type: "error",
            message: error.message,
            ts: new Date().toISOString(),
          });
        } else {
          send({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Failed to process document.",
            ts: new Date().toISOString(),
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

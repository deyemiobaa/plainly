"use client";

import { useState } from "react";
import { ProcessLogPanel } from "@/components/ProcessLog";
import type { Bill, ProcessLogEvent } from "@/lib/types";

async function readSse(
  response: Response,
  onEvent: (event: ProcessLogEvent) => void,
) {
  if (!response.body) {
    throw new Error("The server did not stream any progress.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const dataLine = chunk
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (!dataLine) {
        continue;
      }

      const event = JSON.parse(dataLine.slice(6)) as ProcessLogEvent;
      onEvent(event);
      if (event.type === "error") {
        sawError = event.message;
      }
    }
  }

  if (sawError) {
    throw new Error(sawError);
  }
}

function StoredProcessLog({
  logs,
  processedAt,
}: {
  logs: ProcessLogEvent[];
  processedAt?: string;
}) {
  const when = processedAt?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
    ? `${processedAt.slice(0, 10)} ${processedAt.slice(11, 16)} UTC`
    : null;

  return (
    <details className="group rounded-xl border border-(--rule)">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-(--muted) marker:hidden [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-medium text-(--ink)">Last processing log</span>
          <span>
            {" "}
            · {logs.length === 1 ? "1 line" : `${logs.length} lines`}
            {when ? ` · ${when}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-(--accent) group-open:hidden">
          Show
        </span>
        <span className="hidden shrink-0 text-(--accent) group-open:inline">
          Hide
        </span>
      </summary>
      <div className="px-3 pb-3">
        <ProcessLogPanel logs={logs} />
      </div>
    </details>
  );
}

export function ProcessList({ documents }: { documents: Bill[] }) {
  const [items, setItems] = useState(documents);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logsBySlug, setLogsBySlug] = useState<Record<string, ProcessLogEvent[]>>(
    {},
  );

  function appendLog(slug: string, event: ProcessLogEvent) {
    setLogsBySlug((current) => ({
      ...current,
      [slug]: [...(current[slug] ?? []), event],
    }));
  }

  async function summarize(slug: string, fresh = false) {
    setError(null);
    setPendingSlug(slug);
    setLogsBySlug((current) => ({ ...current, [slug]: [] }));

    try {
      const query = fresh ? "?fresh=1" : "";
      const response = await fetch(
        `/api/documents/${encodeURIComponent(slug)}/summarize${query}`,
        { method: "POST" },
      );

      if (!response.ok && !response.body) {
        throw new Error("Summarization failed.");
      }

      await readSse(response, (event) => appendLog(slug, event));

      const listResponse = await fetch("/api/documents");
      const listPayload = (await listResponse.json()) as { documents: Bill[] };
      setItems(listPayload.documents);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Summarization failed.";
      setError(message);
      setLogsBySlug((current) => {
        const logs = current[slug] ?? [];
        const alreadyLogged = logs.some(
          (line) => line.type === "error" && line.message === message,
        );

        if (alreadyLogged) {
          return current;
        }

        return {
          ...current,
          [slug]: [
            ...logs,
            {
              type: "error",
              message,
              ts: new Date().toISOString(),
            },
          ],
        };
      });
    } finally {
      setPendingSlug(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p className="rounded-2xl border border-[#e4c4b0] bg-[#f8eee8] p-4 text-sm text-[#7a2e12]">
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-4">
        {items.map((doc) => {
          const liveLogs = logsBySlug[doc.slug] ?? [];
          const storedLogs = doc.processLog ?? [];
          const isPending = pendingSlug === doc.slug;

          return (
            <li
              key={doc.slug}
              className="flex flex-col gap-4 rounded-2xl border border-(--rule) bg-(--paper) p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-medium text-(--ink)">{doc.title}</h2>
                  <p className="mt-1 text-sm text-(--muted)">
                    {doc.filename}
                    {doc.hasDigest
                      ? ` · ${doc.topicCount ?? 0} topics`
                      : " · not processed"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => summarize(doc.slug, false)}
                    disabled={pendingSlug !== null}
                    className="rounded-full bg-(--accent) px-5 py-2.5 text-sm font-medium text-(--paper) transition-colors hover:bg-(--accent-hover) disabled:cursor-wait disabled:opacity-60"
                  >
                    {isPending
                      ? "Processing chapters…"
                      : doc.hasDigest
                        ? "Continue"
                        : "Summarize"}
                  </button>
                  {doc.hasDigest ? (
                    <button
                      type="button"
                      onClick={() => summarize(doc.slug, true)}
                      disabled={pendingSlug !== null}
                      className="rounded-full bg-(--accent) px-5 py-2.5 text-sm font-medium text-(--paper) transition-colors hover:bg-(--accent-hover) disabled:cursor-wait disabled:opacity-60"
                    >
                      Start over
                    </button>
                  ) : null}
                </div>
              </div>

              {isPending || liveLogs.length > 0 ? (
                <ProcessLogPanel logs={liveLogs} autoScroll showCursor={isPending} />
              ) : storedLogs.length > 0 ? (
                <StoredProcessLog
                  logs={storedLogs}
                  processedAt={doc.processedAt}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

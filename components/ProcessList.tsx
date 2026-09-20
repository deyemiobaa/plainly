"use client";

import { useEffect, useRef, useState } from "react";
import type { Bill } from "@/lib/types";

type LogLine = {
  type: "info" | "retry" | "error" | "complete";
  message: string;
  ts: string;
};

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function lineClass(type: LogLine["type"]) {
  if (type === "error") {
    return "text-[#f4c4b0]";
  }

  if (type === "retry") {
    return "text-[#f4ead2]";
  }

  if (type === "complete") {
    return "text-[#b7d0c2]";
  }

  return "text-[#dfece4]";
}

async function readSse(
  response: Response,
  onEvent: (event: LogLine) => void,
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

      const event = JSON.parse(dataLine.slice(6)) as LogLine;
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

export function ProcessList({ documents }: { documents: Bill[] }) {
  const [items, setItems] = useState(documents);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logsBySlug, setLogsBySlug] = useState<Record<string, LogLine[]>>({});
  const logRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!pendingSlug) {
      return;
    }

    const node = logRefs.current[pendingSlug];
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [logsBySlug, pendingSlug]);

  function appendLog(slug: string, event: LogLine) {
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
          const logs = logsBySlug[doc.slug] ?? [];
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

              {logs.length > 0 ? (
                <div
                  ref={(node) => {
                    logRefs.current[doc.slug] = node;
                  }}
                  className="max-h-56 overflow-auto rounded-xl bg-[#1c241d] p-3 font-mono text-xs leading-5"
                >
                  {logs.map((line, index) => (
                    <p
                      key={`${line.ts}-${index}`}
                      className={lineClass(line.type)}
                    >
                      <span className="text-[#8a938c]">
                        {formatTime(line.ts)}
                      </span>
                      {"  "}
                      {line.message}
                    </p>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { Bill } from "@/lib/types";

export function ProcessList({ documents }: { documents: Bill[] }) {
  const [items, setItems] = useState(documents);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function summarize(slug: string) {
    setError(null);
    setPendingSlug(slug);

    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(slug)}/summarize`,
        {
          method: "POST",
        },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Summarization failed.");
      }

      const listResponse = await fetch("/api/documents");
      const listPayload = (await listResponse.json()) as { documents: Bill[] };
      setItems(listPayload.documents);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Summarization failed.",
      );
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
        {items.map((doc) => (
          <li
            key={doc.slug}
            className="flex flex-col gap-4 rounded-2xl border border-(--rule) bg-(--paper) p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2 className="font-medium text-(--ink)">{doc.title}</h2>
              <p className="mt-1 text-sm text-(--muted)">
                {doc.filename}
                {doc.hasDigest
                  ? ` · ${doc.topicCount ?? 0} topics`
                  : " · not processed"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => summarize(doc.slug)}
              disabled={pendingSlug !== null}
              className="rounded-full bg-(--accent) px-5 py-2.5 text-sm font-medium text-(--paper) transition-colors hover:bg-(--accent-hover) disabled:cursor-wait disabled:opacity-60"
            >
              {pendingSlug === doc.slug
                ? "Processing chapters…"
                : doc.hasDigest
                  ? "Reprocess"
                  : "Summarize"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

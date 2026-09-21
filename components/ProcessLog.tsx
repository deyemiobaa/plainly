"use client";

import { useEffect, useRef, useState } from "react";
import type { Bill, ProcessLogEvent } from "@/lib/types";

export function formatLogTime(iso: string) {
  const match = iso.match(/T(\d{2}:\d{2}:\d{2})/);
  return match?.[1] ?? "--:--:--";
}

export function logLineClass(type: ProcessLogEvent["type"]) {
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

export function ProcessLogPanel({
  logs,
  autoScroll = false,
  showCursor = false,
  className = "max-h-56",
}: {
  logs: ProcessLogEvent[];
  autoScroll?: boolean;
  showCursor?: boolean;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoScroll) {
      return;
    }

    const node = scrollerRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [autoScroll, logs]);

  return (
    <div
      ref={scrollerRef}
      className={`overflow-auto rounded-xl bg-[#1c241d] p-3 font-mono text-xs leading-5 ${className}`}
      aria-live={autoScroll ? "polite" : undefined}
    >
      {logs.map((line, index) => (
        <p key={`${line.ts}-${index}`} className={logLineClass(line.type)}>
          <span className="text-[#8a938c]">{formatLogTime(line.ts)}</span>
          {"  "}
          {line.message}
        </p>
      ))}
      {showCursor ? (
        <p className="text-[#b7d0c2]" aria-hidden="true">
          <span className="inline-block h-3 w-1.5 translate-y-px bg-[#b7d0c2] motion-safe:animate-pulse" />
        </p>
      ) : null}
    </div>
  );
}

function replayDelayMs(index: number, logs: ProcessLogEvent[]) {
  if (index === 0) {
    return 380;
  }

  const previous = Date.parse(logs[index - 1]?.ts ?? "");
  const current = Date.parse(logs[index]?.ts ?? "");
  const realGap =
    Number.isFinite(current) && Number.isFinite(previous)
      ? current - previous
      : 120;
  const scaled = Math.min(380, Math.max(50, realGap * 0.01));
  const message = logs[index]?.message ?? "";

  if (logs[index]?.type === "complete") {
    return 640;
  }

  if (/calling model/i.test(message)) {
    return Math.max(scaled, 220);
  }

  return scaled;
}

export function ProcessReplay({
  bill,
  logs,
  onDone,
}: {
  bill: Bill;
  logs: ProcessLogEvent[];
  onDone: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const onDoneRef = useRef(onDone);
  const finished = visibleCount >= logs.length;
  const visibleLogs = logs.slice(0, visibleCount);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion) {
      const showAll = window.setTimeout(() => {
        setVisibleCount(logs.length);
      }, 0);
      const skipWait = window.setTimeout(() => onDoneRef.current(), 400);
      return () => {
        window.clearTimeout(showAll);
        window.clearTimeout(skipWait);
      };
    }

    if (finished) {
      const doneWait = window.setTimeout(() => onDoneRef.current(), 900);
      return () => window.clearTimeout(doneWait);
    }

    const wait = replayDelayMs(visibleCount, logs);
    const timer = window.setTimeout(() => {
      setVisibleCount((count) => count + 1);
    }, wait);

    return () => window.clearTimeout(timer);
  }, [finished, logs, visibleCount]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm tracking-wide text-(--muted) uppercase">
            Processing replay
          </p>
          <button
            type="button"
            onClick={() => onDoneRef.current()}
            className="text-sm text-(--accent) underline-offset-4 hover:underline"
          >
            Skip
          </button>
        </div>
        <h1 className="max-w-3xl font-serif text-3xl leading-tight text-(--ink) sm:text-4xl">
          Watching the document become a digest
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-(--muted)">
          These are the real logs from when {bill.title} was processed. The
          breakdown opens when the last line lands.
        </p>
      </header>

      <ProcessLogPanel
        logs={visibleLogs}
        autoScroll
        showCursor={!finished}
        className="max-h-[min(28rem,60vh)] min-h-64 text-[13px] leading-6"
      />

      <p className="font-mono text-xs text-(--muted)">
        {finished
          ? "Opening digest…"
          : `${visibleCount}/${logs.length} log lines`}
      </p>
    </div>
  );
}

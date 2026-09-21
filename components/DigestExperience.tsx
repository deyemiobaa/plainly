"use client";

import { useState } from "react";
import { DigestView } from "@/components/DigestView";
import { ProcessReplay } from "@/components/ProcessLog";
import type { Bill, DocumentDigest } from "@/lib/types";

export function DigestExperience({
  bill,
  digest,
  playIntro = false,
}: {
  bill: Bill;
  digest: DocumentDigest;
  playIntro?: boolean;
}) {
  const logs = digest.process_log ?? [];
  const [showReplay, setShowReplay] = useState(
    playIntro && logs.length > 0,
  );

  function finishReplay() {
    setShowReplay(false);
    window.history.replaceState(null, "", `/bills/${bill.slug}`);
  }

  if (showReplay) {
    return <ProcessReplay bill={bill} logs={logs} onDone={finishReplay} />;
  }

  return <DigestView bill={bill} digest={digest} />;
}

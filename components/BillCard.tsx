import Link from "next/link";
import type { Bill } from "@/lib/types";

export function BillCard({ bill }: { bill: Bill }) {
  return (
    <article className="rounded-2xl border border-(--rule) bg-(--paper) p-6 shadow-[0_12px_40px_-28px_rgba(20,32,24,0.45)] sm:p-8">
      <p className="text-sm tracking-wide text-(--muted) uppercase">
        Bill · {bill.date}
      </p>
      <h2 className="mt-3 font-serif text-2xl leading-snug text-(--ink) sm:text-3xl">
        {bill.title}
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-7 text-(--muted)">
        {bill.teaser}
      </p>
      <Link
        href={`/bills/${bill.slug}`}
        className="mt-6 inline-flex items-center rounded-full bg-(--accent) px-5 py-2.5 text-sm font-medium text-(--paper) transition-colors hover:bg-(--accent-hover)"
      >
        See the breakdown
      </Link>
    </article>
  );
}

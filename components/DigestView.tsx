import type { Bill, DocumentDigest, Topic } from "@/lib/types";

function firstPage(pages?: string) {
  if (!pages) {
    return undefined;
  }

  const match = pages.match(/\d+/);
  return match ? match[0] : undefined;
}

function originalPageHref(file: string, pages?: string) {
  const page = firstPage(pages);
  return page ? `${file}#page=${page}` : file;
}

function TopicCard({
  topic,
  file,
}: {
  topic: Topic;
  file: string;
}) {
  const pageLabel = topic.source_references?.[0]?.pages;

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-(--rule) bg-(--paper) p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-serif text-xl text-(--ink)">{topic.title}</h3>
        {pageLabel ? (
          <a
            href={originalPageHref(file, pageLabel)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full border border-(--rule) px-2.5 py-0.5 text-xs text-(--muted) hover:text-(--ink)"
          >
            pp. {pageLabel}
          </a>
        ) : null}
      </div>

      <p className="text-base leading-7 text-(--ink)">{topic.plain_summary}</p>

      {topic.why_it_matters ? (
        <p className="text-sm leading-6 text-(--muted)">
          <span className="font-medium text-(--ink)">Why it matters. </span>
          {topic.why_it_matters}
        </p>
      ) : null}

      {topic.who_is_affected && topic.who_is_affected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {topic.who_is_affected.map((group) => (
            <span
              key={group}
              className="rounded-full bg-[#dfece4] px-2.5 py-0.5 text-xs text-[#21543c]"
            >
              {group}
            </span>
          ))}
        </div>
      ) : null}

      {topic.key_changes && topic.key_changes.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium text-(--ink)">What would change</h4>
          <ul className="mt-2 flex flex-col gap-2">
            {topic.key_changes.map((change) => (
              <li
                key={change}
                className="border-l-2 border-(--accent) pl-3 text-sm leading-6 text-(--ink)"
              >
                {change}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {topic.what_is_not_changing && topic.what_is_not_changing.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium text-(--ink)">What is not changing</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-(--muted)">
            {topic.what_is_not_changing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {topic.effective_date ? (
        <p className="text-sm text-(--muted)">
          <span className="font-medium text-(--ink)">When. </span>
          {topic.effective_date}
        </p>
      ) : null}

      {topic.source_references && topic.source_references.length > 0 ? (
        <p className="text-xs text-(--muted)">
          Source:{" "}
          {topic.source_references.map((ref, index) => (
            <span key={`${ref.pages}-${ref.section ?? index}`}>
              {index > 0 ? "; " : null}
              <a
                href={originalPageHref(file, ref.pages)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-(--accent) underline-offset-2 hover:underline"
              >
                {ref.section ? `${ref.section}, ` : null}
                pp. {ref.pages}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </article>
  );
}

export function DigestView({
  bill,
  digest,
}: {
  bill: Bill;
  digest: DocumentDigest;
}) {
  const sectionsWithTopics = digest.sections.filter(
    (section) => section.topics.length > 0,
  );

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-4">
        <p className="text-sm tracking-wide text-(--muted) uppercase">
          Plain-language digest
          {bill.date ? ` · ${bill.date}` : null}
        </p>
        <h1 className="max-w-4xl font-serif text-3xl leading-tight text-(--ink) sm:text-4xl">
          {bill.title}
        </h1>
        <a
          href={bill.file}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit text-sm font-medium text-(--accent) underline-offset-4 hover:underline"
        >
          Read the original document
        </a>
      </header>

      <nav aria-label="Chapters">
        <h2 className="text-sm font-medium tracking-wide text-(--muted) uppercase">
          Follow along by chapter
        </h2>
        <ol className="mt-4 flex flex-col gap-2">
          {digest.sections.map((section) => (
            <li key={section.heading}>
              <a
                href={`#${sectionId(section.heading)}`}
                className="text-sm text-(--accent) underline-offset-4 hover:underline"
              >
                {section.heading}
                <span className="text-(--muted)"> · pp. {section.pages}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {sectionsWithTopics.map((section) => (
        <section
          key={section.heading}
          id={sectionId(section.heading)}
          className="scroll-mt-8"
        >
          <h2 className="font-serif text-2xl text-(--ink)">{section.heading}</h2>
          <p className="mt-1 text-sm text-(--muted)">Pages {section.pages}</p>
          <div className="mt-5 flex flex-col gap-4">
            {section.topics.map((topic) => (
              <TopicCard
                key={`${section.heading}-${topic.title}`}
                topic={topic}
                file={bill.file}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function sectionId(heading: string) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function DigestError({
  bill,
  message,
}: {
  bill: Bill;
  message: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        {bill.date ? (
          <p className="text-sm tracking-wide text-(--muted) uppercase">
            {bill.date}
          </p>
        ) : null}
        <h1 className="mt-3 max-w-4xl font-serif text-3xl leading-tight text-(--ink) sm:text-4xl">
          {bill.title}
        </h1>
      </header>
      <div className="rounded-2xl border border-[#e4c4b0] bg-[#f8eee8] p-6 text-[#7a2e12]">
        <p className="font-medium">The digest is not available yet.</p>
        <p className="mt-2 text-sm leading-6">{message}</p>
      </div>
      <a
        href={bill.file}
        target="_blank"
        rel="noopener noreferrer"
        className="w-fit text-sm font-medium text-(--accent) underline-offset-4 hover:underline"
      >
        Read the original document
      </a>
    </div>
  );
}

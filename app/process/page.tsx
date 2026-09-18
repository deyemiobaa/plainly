import { ProcessList } from "@/components/ProcessList";
import { listDocuments } from "@/lib/documents";

export const dynamic = "force-dynamic";

export default async function ProcessPage() {
  const documents = await listDocuments();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-12 sm:px-8 sm:py-16">
      <section className="max-w-2xl">
        <h1 className="font-serif text-4xl text-(--ink)">Process documents</h1>
        <p className="mt-4 text-base leading-7 text-(--muted)">
          Files in <code className="font-mono text-sm">public/bills</code> are
          listed here. Summarize runs once per document: extract text, split by
          chapter, then ask the model for a public-language digest. Visitors
          only ever read the saved JSON.
        </p>
        <p className="mt-3 text-sm leading-6 text-(--muted)">
          A 300-page budget can take several minutes. Watch the log under the
          card. If Gemini is busy, the job retries automatically and Continue
          picks up saved chapters.
        </p>
      </section>

      {documents.length === 0 ? (
        <p className="text-(--muted)">No PDF or text files in public/bills yet.</p>
      ) : (
        <ProcessList documents={documents} />
      )}
    </main>
  );
}

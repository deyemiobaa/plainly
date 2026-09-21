import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DigestError } from "@/components/DigestView";
import { DigestExperience } from "@/components/DigestExperience";
import { getDocument, readDigest } from "@/lib/documents";

export const dynamic = "force-dynamic";

type BillPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ intro?: string | string[] }>;
};

export async function generateMetadata({
  params,
}: BillPageProps): Promise<Metadata> {
  const { slug } = await params;
  const bill = await getDocument(slug);

  if (!bill) {
    return { title: "Document not found" };
  }

  return {
    title: bill.title,
    description: bill.teaser,
  };
}

export default async function BillPage({ params, searchParams }: BillPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const bill = await getDocument(slug);

  if (!bill) {
    notFound();
  }

  const digest = await readDigest(slug);
  const intro = Array.isArray(query.intro) ? query.intro[0] : query.intro;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8 sm:py-16">
      {digest ? (
        <DigestExperience
          bill={bill}
          digest={digest}
          playIntro={intro === "1"}
        />
      ) : (
        <DigestError
          bill={bill}
          message="This file has not been processed yet. Open Process documents and run Summarize. The public page only reads the saved digest — it never calls the model."
        />
      )}
    </main>
  );
}

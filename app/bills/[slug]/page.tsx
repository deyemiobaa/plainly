import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DigestError, DigestView } from "@/components/DigestView";
import { getDocument, readDigest } from "@/lib/documents";

export const dynamic = "force-dynamic";

type BillPageProps = {
  params: Promise<{ slug: string }>;
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

export default async function BillPage({ params }: BillPageProps) {
  const { slug } = await params;
  const bill = await getDocument(slug);

  if (!bill) {
    notFound();
  }

  const digest = await readDigest(slug);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8 sm:py-16">
      {digest ? (
        <DigestView bill={bill} digest={digest} />
      ) : (
        <DigestError
          bill={bill}
          message="This file has not been processed yet. Open Process documents and run Summarize. The public page only reads the saved digest — it never calls the model."
        />
      )}
    </main>
  );
}

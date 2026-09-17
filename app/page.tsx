import { BillCard } from "@/components/BillCard";
import { bills } from "@/data/bills";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-5 py-12 sm:px-8 sm:py-16">
      <section className="max-w-2xl">
        <p className="text-sm tracking-wide text-(--accent) uppercase">
          Hackathon exhibit
        </p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-(--ink) sm:text-5xl">
          We turn policy documents into what they mean for you.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-(--muted)">
          Policy documents are long. This digest shows the concise facts that
          would change life for students, workers, traders, farmers, parents,
          and informal workers.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium tracking-wide text-(--muted) uppercase">
          Available policy documents
        </h2>
        {bills.map((bill) => (
          <BillCard key={bill.slug} bill={bill} />
        ))}
      </section>
    </main>
  );
}

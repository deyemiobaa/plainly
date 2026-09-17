import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-4 px-5 py-16 sm:px-8">
      <h1 className="font-serif text-3xl text-(--ink)">Bill not found</h1>
      <p className="max-w-md text-(--muted)">
        That bill is not in this exhibit. Go back home to see what is available.
      </p>
      <Link
        href="/"
        className="w-fit text-sm font-medium text-(--accent) underline-offset-4 hover:underline"
      >
        Back to home
      </Link>
    </main>
  );
}

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8 sm:py-16">
      <div className="flex animate-pulse flex-col gap-10">
        <div className="flex flex-col gap-3">
          <div className="h-4 w-40 rounded bg-(--rule)" />
          <div className="h-10 w-full max-w-3xl rounded bg-(--rule)" />
          <div className="h-4 w-48 rounded bg-(--rule)" />
        </div>
        <div className="h-36 rounded-2xl bg-(--rule)" />
        <div className="flex flex-col gap-3">
          <div className="h-6 w-48 rounded bg-(--rule)" />
          <div className="h-16 rounded bg-(--rule)" />
          <div className="h-16 rounded bg-(--rule)" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-36 rounded-2xl bg-(--rule)" />
          <div className="h-36 rounded-2xl bg-(--rule)" />
          <div className="h-36 rounded-2xl bg-(--rule)" />
          <div className="h-36 rounded-2xl bg-(--rule)" />
        </div>
      </div>
    </main>
  );
}

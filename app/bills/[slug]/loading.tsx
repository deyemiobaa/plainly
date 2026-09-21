export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8 sm:py-16">
      <div className="flex flex-col gap-6">
        <div className="flex animate-pulse flex-col gap-3">
          <div className="h-3 w-36 rounded bg-(--rule)" />
          <div className="h-9 w-full max-w-xl rounded bg-(--rule)" />
        </div>
        <div className="min-h-64 rounded-xl bg-[#1c241d] p-4 font-mono text-xs leading-6 text-[#8a938c]">
          Opening processing log…
        </div>
      </div>
    </main>
  );
}

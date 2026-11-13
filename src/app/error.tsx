"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center" role="alert">
      <h1 className="text-xl font-semibold">Something went wrong on this page</h1>
      <p className="mt-2 text-sm text-muted">{error.message || "An unexpected error occurred."} Your work is saved; trying again usually helps.</p>
      <button onClick={reset} className="mt-4 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white">Try again</button>
    </div>
  );
}

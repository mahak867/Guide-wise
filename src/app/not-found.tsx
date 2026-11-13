import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">That page does not exist</h1>
      <p className="mt-2 text-sm text-muted">The link may be mistyped, or the draft may have been removed when this browser's demo was reset.</p>
      <Link href="/" className="mt-4 inline-block rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white">Back to reviews</Link>
    </div>
  );
}

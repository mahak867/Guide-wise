import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">That page does not exist</h1>
      <p className="mt-2 text-sm text-muted">The link may be mistyped, or the draft may have been removed when this browser&apos;s demo was reset. Drafts belong to the browser that made them, so a review link opened in another browser is not found either.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link href="/" className="inline-block rounded-[5px] border border-ink bg-ink px-3 py-1.5 text-[13px] font-medium text-paper hover:bg-brand-dark">Back to reviews</Link>
        <Link href="/review/new" className="inline-block rounded-[5px] border border-line bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink/40">Start a new review</Link>
      </div>
    </div>
  );
}

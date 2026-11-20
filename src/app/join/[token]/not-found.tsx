/** Unknown, expired and revoked join links all look the same, so a guess learns nothing about which tokens exist. */
export default function JoinNotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">404 · Join link</p>
      <h1 className="mt-1 text-xl font-semibold">This join link does not work</h1>
      <p className="mt-2 text-sm text-muted">It may have expired (join links last 7 days), been revoked by a reviewer, or been copied incompletely. Ask the person who sent it for a new link.</p>
    </div>
  );
}

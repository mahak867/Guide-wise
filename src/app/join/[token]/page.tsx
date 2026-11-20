import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { lookupInvite } from "@/lib/invite";
import { ROLES } from "@/lib/types";
import { clientIp, shareLookupAllowed } from "@/lib/share";
import { JoinButton } from "@/components/JoinButton";

// A join link to a teammate's workspace. Opening it changes nothing: the visitor reads what joining means and presses Join.
export const metadata: Metadata = { title: "Join a workspace", robots: "noindex", referrer: "no-referrer" };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!shareLookupAllowed(`join:${clientIp(await headers())}`)) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">Too many look-ups</h1>
        <p className="mt-2 text-sm text-muted">This address has opened many links in the last minute. Wait a minute, then reload the page.</p>
      </div>
    );
  }
  const inv = await lookupInvite(token);
  if (!inv) notFound();
  return (
    <div className="mx-auto max-w-lg py-10">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Join link</p>
      <h1 className="mt-1">Join {inv.created_by ? `${inv.created_by}'s` : "a"} workspace</h1>
      <div className="mt-4 space-y-3 rounded-md border border-line bg-white p-5 text-sm">
        <p>
          {inv.created_by || "A reviewer"} invited you to review together.
          {inv.draft_title ? <> Joining opens <b>{inv.draft_title}</b>, and every other draft in the workspace.</> : " Joining opens the drafts in the workspace."}
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>You see the same drafts, findings, Brand Kit and facts, and changes either of you make show up for the other within seconds.</li>
          <li>Pick who you act as in the header (for example {ROLES.compliance.name}, the {ROLES.compliance.title.toLowerCase()}), as in any demo workspace.</li>
          <li>This browser switches to the shared workspace. The drafts this browser had before stay where they are, but it will not open them any more.</li>
        </ul>
        <JoinButton token={token} />
        <p className="text-xs text-muted">The link is valid until {day(inv.expires_at)}. A reviewer can revoke it at any time.</p>
      </div>
    </div>
  );
}

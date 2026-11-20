"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Notice, PageHead, STATUS } from "@/components/ui";
import { complianceSignOff } from "@/lib/approval";
import { api, fmtDate, useApp } from "@/lib/client";
import { analyseImage } from "@/lib/image";
import { DEMO_CAPTION, DEMO_INTENT } from "@/lib/seed";
import { CONTENT_TYPES, ROLES, type Role } from "@/lib/types";

interface Row {
  id: string; title: string; content_type: string; status: string; risk_tier: string | null; impact?: { reason: string } | null;
  version: number; author: string; mode: string; updated_at: string; open: number;
}

/** What the list adds from each review's detail: totals, why it is high risk, the standing compliance sign-off and the last thing that happened. */
interface Detail { total: number; fixed: number; dismissed: number; reasons: string[]; signed: boolean; last: { actor: string; action: string; at: string } | null }

const TYPE_LABEL: Record<string, string> = Object.fromEntries(CONTENT_TYPES.map((t) => [t.v, t.l]));

/** The last event, in a few words: "Kavya dismissed a finding". */
const LAST: Record<string, string> = {
  review_run: "ran the review", fix_accepted: "accepted a fix", finding_dismissed: "dismissed a finding", finding_reopened: "reopened a finding",
  text_edited: "edited the text", images_updated: "updated the images", assets_updated: "updated the documents", submitted: "submitted it",
  approved: "approved it", approved_partial: "gave the compliance sign-off", changes_requested: "requested changes", comment: "commented",
  reapproval_needed: "sent it back for re-approval", exception_lapsed: "reopened a lapsed exception",
  fix_undone: "undid a fix", share_created: "shared the approval record", share_revoked: "revoked a share link", assets_saved: "updated the documents",
  invite_created: "invited a teammate", invite_revoked: "revoked a join link", invite_accepted: "joined through a join link",
  approval_blocked_kit_changed: "tried to approve; the Brand Kit had changed", approval_blocked_exception_lapsed: "tried to approve; an exception had lapsed",
};
const lastText = (l: { actor: string; action: string }) => `${l.actor} ${LAST[l.action] ?? l.action.replace(/_/g, " ")}`;

/** Who acts next on a review, from its status (and, for high risk, whether compliance has already signed): a name and the step. */
function nextActor(status: string, signed: boolean): { role: Role | null; who: string; what: string } {
  switch (status) {
    case "draft": return { role: "creator", who: ROLES.creator.name, what: "resolve findings and submit" };
    case "changes_requested": return { role: "creator", who: ROLES.creator.name, what: "make the requested changes" };
    case "brand_review": return { role: "brand", who: `${ROLES.brand.name} or ${ROLES.manager.name}`, what: "brand approval" };
    case "compliance_review": return signed
      ? { role: "brand", who: `${ROLES.brand.name} or ${ROLES.manager.name}`, what: "second sign-off (brand)" }
      : { role: "compliance", who: ROLES.compliance.name, what: "compliance sign-off" };
    default: return { role: null, who: "No one", what: "approved and locked" };
  }
}

/** "4 min ago", "3 h ago", "2 days ago". */
function ago(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (!now || m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** The risk reasons, in a few plain words for the list. */
function riskWhy(tier: string | null, reasons: string[] | undefined, open: number): string | null {
  if (!tier) return null;
  if (tier !== "high") return "No outcome claim, no open critical finding";
  // "N critical findings still unresolved" was true when the risk was set; once nothing is open it no longer is.
  const now = (reasons ?? []).filter((r) => open > 0 || !/critical findings? still unresolved/.test(r));
  if (!now.length) return null;
  return now.map((r) => (/^Outcome/.test(r) ? "an outcome or regulated claim" : r.replace(/ still unresolved$/, " were open at the last check"))).join("; ");
}

const LEGEND: { status: string; text: string }[] = [
  { status: "draft", text: `${ROLES.creator.name} is resolving findings; it has not been submitted yet.` },
  { status: "changes_requested", text: "A reviewer sent it back with a comment. The creator edits and submits again." },
  { status: "brand_review", text: `Low risk: one approval from ${ROLES.brand.name} (brand) or ${ROLES.manager.name}.` },
  { status: "compliance_review", text: `High risk: ${ROLES.compliance.name} signs off first, then brand gives a second sign-off.` },
  { status: "approved", text: "Locked, with a receipt that fingerprints the exact approved text." },
];

const MINE: Record<string, string[]> = {
  creator: ["draft", "changes_requested"],
  brand: ["brand_review"],
  compliance: ["compliance_review"],
  manager: [],
};

export default function Home() {
  const { role, setRole, state } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    try {
      const list = (await api<{ drafts: Row[] }>("/api/drafts")).drafts;
      setRows(list);
      setNow(Date.now());
      // Totals, risk reasons and sign-offs come from each review's detail: fetched for the most recent ones, three at a time.
      const queue = list.slice(0, 8);
      const worker = async () => {
        for (let r = queue.shift(); r; r = queue.shift()) {
          const id = r.id;
          try {
            const d = await api<{ draft: { risk_reasons?: string[] }; findings: { state?: string }[]; events: { id?: number; actor: string; role: string; action: string; at: string }[] }>(`/api/drafts/${id}`);
            const top = d.events[0];
            setDetails((m) => ({ ...m, [id]: {
              total: d.findings.length,
              fixed: d.findings.filter((f) => f.state === "accepted" || f.state === "resolved").length,
              dismissed: d.findings.filter((f) => f.state === "dismissed").length,
              reasons: d.draft.risk_reasons ?? [],
              signed: !!complianceSignOff(d.events),
              last: top ? { actor: top.actor, action: top.action, at: top.at } : null,
            } }));
          } catch { /* the row still shows what the list returned */ }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  // A first visit creates the demo workspace while the app state loads, so the list is fetched once that is done.
  const ready = state?.kit.ws;
  useEffect(() => {
    if (ready) queueMicrotask(load);
  }, [ready, load]);
  useEffect(() => {
    window.addEventListener("gw-reset", load);
    return () => window.removeEventListener("gw-reset", load);
  }, [load]);

  async function runDemo() {
    setBusy("Reading the sample creative…");
    setError(null);
    try {
      setRole("creator");
      const blob = await (await fetch("/sample-creative.png")).blob();
      const logo = state ? state.kit.logo : (await api<{ kit: { logo?: string | null } }>("/api/state").catch(() => null))?.kit.logo;
      const image = await analyseImage(blob, "sample-creative.png", (s) => setBusy(`Sample creative: ${s}`), logo).catch(() => null);
      setBusy("Reviewing the caption and the creative…");
      const { id } = await api<{ id: string }>("/api/drafts", {
        title: "Instagram post: December JEE batch", content_type: "social", text: DEMO_CAPTION, intent: DEMO_INTENT,
        images: image ? [image] : [],
      });
      router.push(`/review/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  // A high-risk review whose compliance sign-off is in is waiting for brand, not compliance.
  const isMine = (r: Row) => (r.status === "compliance_review" && details[r.id]?.signed ? role === "brand" : MINE[role].includes(r.status));
  const mine = rows?.filter(isMine) ?? [];
  const ordered = rows ? [...mine, ...rows.filter((r) => !mine.includes(r))] : [];

  return (
    <>
      <section className="mb-10 border-b border-line pb-8 pt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Brand rules that run</p>
        <h1 className="mt-2 max-w-3xl !text-[2.9rem] !leading-[1.05]">Check a draft <em>before</em> it is published.</h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
          Every finding quotes the rule it breaks and the exact words, with a re-tested fix. Risky content goes to the right reviewer, and a person makes the final approval.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button variant="primary" className="!px-5 !py-2.5 !text-[15px]" onClick={runDemo} disabled={!!busy}>{busy ?? "Review the sample post"}</Button>
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/review/new" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">Check your own draft</Link>
            <Link href="/review/new#hard" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">Try a hard case</Link>
            <a href="/demo.webm" target="_blank" rel="noreferrer" className="text-muted underline decoration-line underline-offset-4 hover:text-ink">Watch the 100-second walkthrough</a>
          </span>
        </div>
        <ol className="mt-8 grid gap-x-6 gap-y-2 border-t border-line pt-5 text-[13px] leading-relaxed text-muted sm:grid-cols-4">
          <li><b className="text-ink">1. Review.</b> A sample Instagram post with problems in the caption and the creative.</li>
          <li><b className="text-ink">2. Fix.</b> Accept the re-tested fixes. Image findings stay open for the reviewer.</li>
          <li><b className="text-ink">3. Submit.</b> Outcome claims route it to compliance.</li>
          <li><b className="text-ink">4. Approve.</b> Act as Kavya, then Arjun, to sign off and get the receipt.</li>
        </ol>
        <div className="mt-6 border-t border-line pt-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">New in the final round</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              { href: "/review/new?sample=campaign", title: "Review a whole campaign", body: "Caption, creative, brochure and landing page together; AI vision checks the people shown.",
                see: "The fee, start date and promo code disagree across documents, and each finding names where it is." },
              { href: "/facts", title: "See what a change touches", body: "Edit fact F-3's figure: every draft that used it is re-checked.",
                see: "The approved WhatsApp post goes back for re-approval, with the reason." },
              { href: "/developers", title: "Check drafts from AI tools", body: "Create an API key and call check_draft over REST or MCP.",
                see: "The same cited findings as the app, and every call in an audit trail." },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="group flex flex-col rounded-md border border-line bg-white p-4 transition-colors hover:border-brand">
                <b className="font-serif text-[15px] font-medium text-ink group-hover:text-brand-dark">{c.title} →</b>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{c.body}</p>
                <p className="mt-2 border-t border-line pt-2 text-[12.5px] leading-relaxed text-muted"><b className="font-medium text-ink">You will see:</b> {c.see}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}

      <PageHead
        title="Reviews"
        sub={MINE[role].length
          ? `${mine.length} waiting for ${ROLES[role].name} (${ROLES[role].title.toLowerCase()}), shown first.`
          : `${ROLES[role].name} owns the Brand Kit. All reviews are listed for reference.`}
      />
      <Card>
        {rows === null ? (
          <p className="p-5 text-sm text-muted">Loading reviews…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">No drafts have been reviewed yet. Start with the sample post above.</p>
        ) : (
          <>
            <div aria-hidden className="hidden border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-muted md:grid md:grid-cols-[minmax(0,1fr)_10rem_14rem_8rem] md:gap-4">
              <span>Draft</span><span>Status</span><span>Waiting for</span><span>Open findings</span>
            </div>
            <ul className="divide-y divide-line">
              {ordered.map((r) => {
                const d = details[r.id];
                const next = nextActor(r.status, !!d?.signed);
                const why = riskWhy(r.risk_tier, d?.reasons, r.open);
                const you = mine.includes(r);
                const when = d?.last?.at ?? r.updated_at;
                return (
                  <li key={r.id} className={`px-4 py-3 text-sm ${you ? "bg-brand-soft/40" : ""}`}>
                    <div className="grid gap-x-4 gap-y-1.5 md:grid-cols-[minmax(0,1fr)_10rem_14rem_8rem] md:items-start">
                      <div className="min-w-0">
                        <Link href={`/review/${r.id}`} className="font-medium text-brand-dark underline-offset-2 hover:underline">{r.title}</Link>
                        <div className="text-xs text-muted"><span title={fmtDate(when)}>{ago(when, now)}</span> · {TYPE_LABEL[r.content_type] ?? r.content_type}</div>
                      </div>
                      <div className="flex flex-wrap gap-1"><Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</Badge>{r.impact && <Badge tone="critical">Re-approval</Badge>}</div>
                      <div>
                        {next.role ? <><span className="text-muted md:sr-only">Waiting for </span><b className="font-medium">{next.who}</b><span className="text-muted">: {next.what}</span></> : <span className="text-muted">Approved and locked</span>}
                        {you && <span className="ml-1 text-xs font-medium text-brand-dark">(you)</span>}
                      </div>
                      <div>{d && d.total === 0 ? <span className="text-muted">No findings</span> : <><b className="font-medium">{r.open}</b> open<span className="md:sr-only"> finding{r.open === 1 ? "" : "s"}</span></>}</div>
                    </div>
                    <details className="mt-1 text-xs text-muted">
                      <summary className="w-fit cursor-pointer select-none hover:text-ink">More about this review</summary>
                      <dl className="mt-1.5 grid grid-cols-[7rem_minmax(0,1fr)] gap-x-2 gap-y-0.5">
                        <dt>Risk</dt><dd className="text-ink">{r.risk_tier ? `${r.risk_tier === "high" ? "High" : "Low"}${why ? `: ${why}` : ""}` : "Not set yet"}</dd>
                        {d && d.total > 0 && <><dt>Findings</dt><dd className="text-ink">{r.open} open of {d.total}: {d.fixed} fixed, {d.dismissed} dismissed</dd></>}
                        <dt>Last activity</dt><dd className="text-ink">{d?.last ? `${lastText(d.last)}, ` : ""}{fmtDate(when)}</dd>
                        <dt>Draft</dt><dd className="text-ink">By {r.author} · version {r.version} · {r.mode === "ai" ? "code and AI checks" : "code checks"}</dd>
                      </dl>
                    </details>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
      <details className="mt-3 rounded-md border border-line bg-white/60 px-4 py-3 text-xs text-muted">
        <summary className="cursor-pointer select-none font-medium text-ink">What the statuses mean</summary>
        <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {LEGEND.map((l) => (
            <div key={l.status} className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
              <dt className="shrink-0"><Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge></dt><dd className="min-w-0 flex-1 basis-40">{l.text}</dd>
            </div>
          ))}
          <div className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
            <dt className="shrink-0"><Badge tone="critical">Re-approval</Badge></dt><dd className="min-w-0 flex-1 basis-40">It was approved, then a fact or rule change made it fail, so it needs approving again.</dd>
          </div>
        </dl>
        <p className="mt-2"><b className="font-medium text-ink">Risk</b> is high when a rule about outcomes, claims or regulated content was flagged, or a critical finding is still open; high risk needs two sign-offs. Rows waiting for the person you are acting as are shaded.</p>
      </details>
    </>
  );
}

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
  approval_blocked_kit_changed: "tried to approve; the Brand Kit had changed", approval_blocked_exception_lapsed: "tried to approve; an exception had lapsed",
};
const lastText = (l: { actor: string; action: string }) => `${l.actor} ${LAST[l.action] ?? l.action.replace(/_/g, " ")}`;

/** Who acts next on a review, from its status (and, for high risk, whether compliance has already signed). */
function nextActor(status: string, signed: boolean): { role: Role | null; text: string } {
  switch (status) {
    case "draft": return { role: "creator", text: `${ROLES.creator.name}, to resolve findings and submit` };
    case "changes_requested": return { role: "creator", text: `${ROLES.creator.name}, to make the requested changes` };
    case "brand_review": return { role: "brand", text: `${ROLES.brand.name} (or ${ROLES.manager.name}), for brand approval` };
    case "compliance_review": return signed
      ? { role: "brand", text: `${ROLES.brand.name} (or ${ROLES.manager.name}), for the second sign-off` }
      : { role: "compliance", text: `${ROLES.compliance.name}, for the compliance sign-off` };
    default: return { role: null, text: "No one: approved and locked" };
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
          Guidewise checks marketing content against the team's approved rules and dated facts. Every finding quotes the rule it breaks and the exact words, offers a re-tested fix, and
          risky content goes to the right reviewer. A person makes the final approval.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" onClick={runDemo} disabled={!!busy}>{busy ?? "Review the sample post"}</Button>
          <Link href="/review/new"><Button>Check your own draft</Button></Link>
          <Link href="/review/new#hard"><Button>Try a hard case</Button></Link>
          <a href="/demo.webm" target="_blank" rel="noreferrer" className="self-center px-1 text-sm text-muted underline underline-offset-2 hover:text-ink">Watch a 100-second walkthrough</a>
        </div>
        <ol className="mt-8 grid gap-x-6 gap-y-3 border-t border-line pt-5 text-[13px] leading-relaxed text-muted sm:grid-cols-4">
          <li><b className="text-ink">1. Review.</b> The sample is an Instagram post from a fictional coaching brand: a caption and a creative, with problems in both.</li>
          <li><b className="text-ink">2. Resolve.</b> Accept the re-tested fixes for the caption. Image findings are fixed in the design file, so they stay open for the reviewer.</li>
          <li><b className="text-ink">3. Route.</b> Submit. Outcome claims send it to the compliance reviewer.</li>
          <li><b className="text-ink">4. Approve.</b> Switch to Kavya, dismiss what is left with a reason (or request changes) and approve; high-risk content then needs Arjun's brand sign-off before the receipt.</li>
        </ol>
        <div className="mt-6 border-t border-line pt-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">New in the final round</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              { href: "/review/new?sample=campaign", title: "Review a whole campaign", body: "Caption, creative, brochure and landing page together. Prices, dates and promo codes that disagree are flagged, and AI vision checks the people shown.",
                see: "The form fills itself. Press Run review: the fee (₹12,999 against ₹14,999), the start date and the promo code each disagree, and every finding names the document it is in." },
              { href: "/facts", title: "See what a change touches", body: "The WhatsApp results post below is already approved. Edit fact F-3's figure: every draft that used it is re-checked and the approved post goes back for re-approval.",
                see: "An impact panel listing each draft that was re-checked and what happened to it. The approved post leaves Approved, and its review page says why." },
              { href: "/developers", title: "Check drafts from AI tools", body: "Create an API key and call check_draft over REST or MCP: the same cited findings as the app, with an audit trail.",
                see: "A key shown once, the JSON findings for a sample draft from either transport, and every call logged with its time and result." },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="group flex flex-col rounded-md border border-line bg-white p-4 transition-colors hover:border-brand">
                <b className="font-serif text-[15px] font-medium text-ink group-hover:text-brand-dark">{c.title} →</b>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{c.body}</p>
                <p className="mt-2 border-t border-line pt-2 text-[12.5px] leading-relaxed text-muted"><b className="font-medium text-ink">What you will see:</b> {c.see}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}

      <PageHead
        title="Reviews"
        sub={MINE[role].length
          ? `${mine.length} waiting for ${ROLES[role].name} (${ROLES[role].title.toLowerCase()}). Everything else is shown below it.`
          : `${ROLES[role].name} owns the Brand Kit. All reviews are listed for reference.`}
      />
      <Card>
        {rows === null ? (
          <p className="p-5 text-sm text-muted">Loading reviews…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">No drafts have been reviewed yet. Start with the sample caption above.</p>
        ) : (
          <>
            {/* Wide screens: one row per review. */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Draft</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="px-4 py-2.5 font-medium">Findings</th><th className="px-4 py-2.5 font-medium">Waiting for</th><th className="px-4 py-2.5 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((r) => {
                  const d = details[r.id];
                  const next = nextActor(r.status, !!d?.signed);
                  const why = riskWhy(r.risk_tier, d?.reasons, r.open);
                  return (
                    <tr key={r.id} className={`border-b border-line align-top last:border-0 ${mine.includes(r) ? "bg-brand-soft/40" : ""}`}>
                      <td className="px-4 py-2.5">
                        <Link href={`/review/${r.id}`} className="font-medium text-brand-dark underline-offset-2 hover:underline">{r.title}</Link>
                        <div className="text-xs text-muted">{TYPE_LABEL[r.content_type] ?? r.content_type} · by {r.author} · v{r.version} · {r.mode === "ai" ? "code and AI checks" : "code checks"}</div>
                      </td>
                      <td className="px-4 py-2.5"><Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</Badge>{r.impact && <span className="ml-1"><Badge tone="critical">Re-approval</Badge></span>}</td>
                      <td className="px-4 py-2.5">
                        {r.risk_tier ? <Badge tone={r.risk_tier === "high" ? "critical" : "green"}>{r.risk_tier === "high" ? "High" : "Low"}</Badge> : "–"}
                        {why && <div className="mt-0.5 max-w-[11rem] text-xs text-muted">{why}</div>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {d && d.total === 0 ? "No findings" : <><b className="font-medium">{r.open}</b> open{d ? <> of {d.total}</> : null}</>}
                        {d && d.total > 0 && <div className="text-xs text-muted">{d.fixed} fixed · {d.dismissed} dismissed</div>}
                      </td>
                      <td className="max-w-[13rem] px-4 py-2.5">
                        {next.text}
                        {mine.includes(r) && <div className="text-xs font-medium text-brand-dark">That is you</div>}
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        <span className="whitespace-nowrap text-ink" title={fmtDate(d?.last?.at ?? r.updated_at)}>{ago(d?.last?.at ?? r.updated_at, now)}</span>
                        <div className="text-xs">{d?.last ? lastText(d.last) : fmtDate(r.updated_at)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Phones: the same facts, stacked, so nothing scrolls sideways. */}
            <ul className="divide-y divide-line md:hidden">
              {ordered.map((r) => {
                const d = details[r.id];
                const next = nextActor(r.status, !!d?.signed);
                const why = riskWhy(r.risk_tier, d?.reasons, r.open);
                return (
                  <li key={r.id} className={`px-4 py-3 text-sm ${mine.includes(r) ? "bg-brand-soft/40" : ""}`}>
                    <Link href={`/review/${r.id}`} className="font-medium text-brand-dark underline-offset-2 hover:underline">{r.title}</Link>
                    <div className="text-xs text-muted">{TYPE_LABEL[r.content_type] ?? r.content_type} · by {r.author} · v{r.version}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</Badge>
                      {r.impact && <Badge tone="critical">Re-approval</Badge>}
                      {r.risk_tier && <Badge tone={r.risk_tier === "high" ? "critical" : "green"}>{r.risk_tier === "high" ? "High risk" : "Low risk"}</Badge>}
                    </div>
                    <dl className="mt-1.5 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs">
                      <dt className="text-muted">Findings</dt><dd>{d && d.total === 0 ? "No findings" : `${r.open} open${d ? ` of ${d.total} (${d.fixed} fixed, ${d.dismissed} dismissed)` : ""}`}</dd>
                      {why && <><dt className="text-muted">Risk because</dt><dd>{why}</dd></>}
                      <dt className="text-muted">Waiting for</dt><dd>{next.text}{mine.includes(r) ? " (you)" : ""}</dd>
                      <dt className="text-muted">Last activity</dt><dd>{ago(d?.last?.at ?? r.updated_at, now)}{d?.last ? `: ${lastText(d.last)}` : ""}</dd>
                    </dl>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
      <div className="mt-3 rounded-md border border-line bg-white/60 px-4 py-3 text-xs text-muted">
        <h2 className="!font-sans !text-xs uppercase !tracking-[0.1em] text-ink">What the statuses mean</h2>
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
      </div>
    </>
  );
}

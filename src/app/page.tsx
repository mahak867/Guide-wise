"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Notice, PageHead, STATUS } from "@/components/ui";
import { api, fmtDate, useApp } from "@/lib/client";
import { analyseImage } from "@/lib/image";
import { DEMO_CAPTION, DEMO_INTENT } from "@/lib/seed";
import { ROLES } from "@/lib/types";

interface Row {
  id: string; title: string; content_type: string; status: string; risk_tier: string | null;
  version: number; author: string; mode: string; updated_at: string; open: number;
}

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

  const load = useCallback(async () => {
    try {
      setRows((await api<{ drafts: Row[] }>("/api/drafts")).drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    queueMicrotask(load);
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

  const mine = rows?.filter((r) => MINE[role].includes(r.status)) ?? [];

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
        </div>
        <ol className="mt-8 grid gap-x-6 gap-y-3 border-t border-line pt-5 text-[13px] leading-relaxed text-muted sm:grid-cols-4">
          <li><b className="text-ink">1. Review.</b> The sample is an Instagram post from a fictional coaching brand: a caption and a creative, with problems in both.</li>
          <li><b className="text-ink">2. Resolve.</b> Accept the re-tested fixes for the caption. Image findings are fixed in the design file, so they stay open for the reviewer.</li>
          <li><b className="text-ink">3. Route.</b> Submit. Outcome claims send it to the compliance reviewer.</li>
          <li><b className="text-ink">4. Approve.</b> Switch to Kavya, dismiss what is left with a reason (or request changes), and approve to get the receipt.</li>
        </ol>
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Draft</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="px-4 py-2.5 font-medium">Open findings</th><th className="px-4 py-2.5 font-medium">Version</th><th className="px-4 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {[...mine, ...rows.filter((r) => !mine.includes(r))].map((r) => (
                  <tr key={r.id} className={`border-b border-line last:border-0 ${mine.includes(r) ? "bg-brand-soft/40" : ""}`}>
                    <td className="px-4 py-2.5">
                      <Link href={`/review/${r.id}`} className="font-medium text-brand-dark underline-offset-2 hover:underline">{r.title}</Link>
                      <div className="text-xs text-muted">{r.content_type} · by {r.author}{mine.includes(r) ? " · waiting for you" : ""}</div>
                    </td>
                    <td className="px-4 py-2.5"><Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</Badge></td>
                    <td className="px-4 py-2.5">{r.risk_tier ? <Badge tone={r.risk_tier === "high" ? "critical" : "green"}>{r.risk_tier === "high" ? "High" : "Low"}</Badge> : "–"}</td>
                    <td className="px-4 py-2.5">{r.open}</td>
                    <td className="px-4 py-2.5">v{r.version}</td>
                    <td className="px-4 py-2.5 text-muted">{fmtDate(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

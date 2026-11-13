"use client";
import { Card, PageHead } from "@/components/ui";
import { useApp } from "@/lib/client";

const STEPS = [
  ["Remove personal data", "Emails and phone numbers are replaced with placeholders in code before any text is sent to an AI service."],
  ["Code checks", "Preferred terms, banned phrases, approved contacts, student records, and every figure compared with the Facts Register. Instant, free and fully explainable."],
  ["AI checks", "Claims and Voice. One rule per call, with that rule's test sentences as the boundary. A rule that returns a finding is run a second time; disagreement downgrades it to a suggestion."],
  ["Verifier", "Plain code. A finding is dropped unless its quoted words are in the draft, its rule exists and its cited fact exists. No source, no flag."],
  ["Fix and re-test", "Each suggested fix is applied and the checks are run again. A fix that would introduce a new issue is withdrawn."],
  ["Route and approve", "A fixed rule table sends outcome claims and regulated content to the compliance reviewer and everything else to the brand reviewer. A person approves, and a receipt records what was approved."],
];

export default function About() {
  const { state } = useApp();
  return (
    <>
      <PageHead title="How Guidewise works" sub="Only one step uses AI. Everything around it is code that can reject what the AI returns." />
      <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {STEPS.map(([t, d], i) => (
          <li key={t}><Card className={`h-full p-4 ${i === 2 ? "border-brand" : ""}`}><div className="text-xs font-medium uppercase tracking-wide text-muted">Step {i + 1}{i === 2 ? " · the only AI step" : ""}</div><h2 className="mt-1 font-semibold">{t}</h2><p className="mt-1 text-sm text-muted">{d}</p></Card></li>
        ))}
      </ol>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="p-4 text-sm">
          <h2 className="font-semibold">What this version does, and what it does not</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>Reviews text: social posts, ads, emails, page copy and DOCX files. Image and visual-identity review is planned for Round 3; the palette is stored but not yet checked against images.</li>
            <li>The verifier confirms that a finding is grounded in a real rule and real words. It does not prove the judgment is right, which is why any finding can be dismissed with a reason and a person approves.</li>
            <li>There is no sign-in in this version, so judges can open it directly. The four roles are switched with "Acting as". Role rules are still enforced on the server.</li>
            <li>Guidewise supports reviewers. It does not give legal advice. Regulation rules cite public sources and must be confirmed by the organisation.</li>
            <li>Accuracy has not been measured yet. We will publish precision and recall on a planted-error test set when it is run, and not before.</li>
          </ul>
        </Card>
        <Card className="p-4 text-sm">
          <h2 className="font-semibold">Services and data</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><b>AI:</b> Claude API (Anthropic), model <code className="rounded bg-mist px-1">{state?.ai.model ?? "…"}</code>. Status now: {state ? (state.ai.available ? "on" : "off (rules-only mode: code checks and the whole workflow still run, nothing is sent outside)") : "…"}.</li>
            <li><b>Database:</b> Supabase Postgres. <b>Hosting:</b> Vercel.</li>
            <li><b>Open source:</b> Next.js, React, Tailwind CSS, supabase-js, Anthropic SDK, Zod, mammoth (DOCX text).</li>
            <li><b>Demo data:</b> PrepPath Academy, its rules, facts and students are fictional and were written by the team.</li>
            <li><b>Precedents:</b> penalty orders are cited as reported in the linked press coverage. We have not read the orders themselves.</li>
            <li><b>Built with AI assistance:</b> Claude (Anthropic) was used to write code during the build window.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

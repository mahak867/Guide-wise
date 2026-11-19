"use client";
import { Card, PageHead } from "@/components/ui";
import { useApp } from "@/lib/client";

const STEPS: [string, string, boolean?][] = [
  ["Remove personal data", "Emails, phone numbers, Aadhaar, PAN and card numbers are replaced with placeholders in code before any text is sent to an AI service. A draft marked confidential is never sent at all."],
  ["Code checks", "Preferred terms, banned phrases, approved contacts, student records, disclaimers, spelling of the brand name, hidden characters, and every figure compared with the Facts Register. Instant, free and fully explainable."],
  ["AI checks", "Claims and voice. One rule per call, with that rule's test sentences as the boundary. A rule that returns a finding is run a second time; disagreement downgrades it to a suggestion.", true],
  ["AI vision", "Each creative is read once for text that OCR missed and for people shown. People are described, never named, and raise a consent check for compliance.", true],
  ["Campaign documents", "Brochure, landing page or email text gets every code check and every AI check, quoting the document it came from. The AI reads all the documents in one request per rule; code finds which document holds each quote.", true],
  ["Consistency", "Prices, figures, dates and promo codes are compared across the caption, every creative and every document. A mismatch quotes both sides."],
  ["Verifier", "Plain code. A finding is dropped unless its quoted words are in the draft, image or document it cites, its rule exists and its cited fact exists. No source, no flag."],
  ["Fix and re-test", "Each suggested fix is applied and the checks are run again. A fix that would introduce a new issue is withdrawn."],
  ["Route and approve", "A fixed rule table sends outcome claims, regulated content, mismatched prices and people shown to the compliance reviewer, and everything else to the brand reviewer. A person approves (high-risk content needs compliance and then brand), and a receipt records what was approved and by whom. An exception can be granted until a date, after which the finding reopens."],
];

export default function About() {
  const { state } = useApp();
  return (
    <>
      <PageHead title="How Guidewise works" sub="Three of the nine steps use AI. Everything around them is code that can reject what the AI returns, and numbers are always compared by code. (The brand-guide compiler also uses AI, and the manager confirms every rule it proposes.)" />
      <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {STEPS.map(([t, d, ai], i) => (
          <li key={t}><Card className={`h-full p-4 ${ai ? "border-brand" : ""}`}><div className="text-xs font-medium uppercase tracking-wide text-muted">Step {i + 1}{ai ? " · uses AI" : ""}</div><h2 className="mt-1">{t}</h2><p className="mt-1 text-sm text-muted">{d}</p></Card></li>
        ))}
      </ol>

      <Card className="mt-6 p-4 text-sm">
        <h2>Around the review</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li><b>Change impact.</b> Changing, expiring or deleting a fact, or changing a rule, re-checks every draft that used it. An approved piece that no longer passes goes back for re-approval with the reason. The demo starts with one approved post that cites F-3: edit F-3 on Facts and assets to see it.</li>
          <li><b>API and MCP server.</b> AI writing tools fetch the brief (rules in force, only the facts valid today) and check a draft before handing it over, with scoped keys and an audit trail. See the API page.</li>
          <li><b>Insights.</b> Rules that are dismissed most get clearer wording drafted for them; code re-runs every test, the manager approves, and the dismissal rate before and after is shown.</li>
        </ul>
      </Card>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="p-4 text-sm">
          <h2>What this version does, and what it does not</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>Reviews text (pasted, DOCX or PDF), up to four images and up to four campaign documents per draft. For images it checks the palette, contrast, alt text and the Brand Kit logo (present, large enough, clear space), runs every code check on the words read from the image, and uses AI vision to read stylised text and find people shown.</li>
            <li>The AI checks read the caption, every campaign document and the text in each creative. Pictures inside a PDF brochure are not extracted; upload them as creatives to check them.</li>
            <li>AI vision flags a person shown for a consent check; it does not recognise who they are. A reviewer confirms consent against the student records.</li>
            <li>The logo check matches the logo file itself. A redrawn, recoloured or heavily stretched logo is reported as missing, and a reviewer can dismiss that with a reason.</li>
            <li>The verifier confirms that a finding is grounded in a real rule and real words. It does not prove the judgment is right, which is why any finding can be dismissed with a reason and a person approves.</li>
            <li>There is no sign-in in this version, so judges can open it directly. The four roles are switched with "Acting as". Role rules are still enforced on the server.</li>
            <li>Guidewise supports reviewers. It does not give legal advice. Regulation rules cite public sources and must be confirmed by the organisation.</li>
            <li>Accuracy is measured on a planted-error test set written by the team; see the Results page for the numbers, the method and why they are optimistic. The AI checks were measured on all 40 held-out drafts, twice.</li>
          </ul>
        </Card>
        <Card className="p-4 text-sm">
          <h2>Services and data</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li><b>AI:</b> one adapter that supports Groq, Gemini and Claude and falls through to the next on errors or rate limits. In use: <code className="rounded bg-mist px-1">{state?.ai.model ?? "…"}</code>. Status now: {state ? (state.ai.available ? "on" : "off (rules-only mode: code checks and the whole workflow still run, nothing is sent outside)") : "…"}.</li>
            <li><b>Database:</b> Supabase Postgres. <b>Hosting:</b> Vercel.</li>
            <li><b>Open source:</b> Next.js, React, Tailwind CSS, supabase-js, Model Context Protocol SDK, Anthropic SDK, groq-sdk, @google/genai, Zod, mammoth (DOCX text), unpdf (PDF text), tesseract.js (text in images).</li>
            <li><b>Demo data:</b> PrepPath Academy, its rules, facts and students are fictional and were written by the team.</li>
            <li><b>Precedents:</b> penalty orders are cited as reported in the linked press coverage. We have not read the orders themselves.</li>
            <li><b>Built with AI assistance:</b> Claude (Anthropic) was used to help write code during the build windows.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

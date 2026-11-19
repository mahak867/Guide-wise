// Privacy evaluation: plant personal data and confidential canaries in drafts, capture every prompt the AI
// would receive, and count leaks. Run: npx vitest run tests/privacy-eval.test.ts
import { describe, expect, it, vi } from "vitest";

const prompts: string[] = [];
vi.mock("groq-sdk", () => ({
  default: class {
    chat = { completions: { create: async (req: { messages: { content: unknown }[] }) => {
      prompts.push(JSON.stringify(req.messages));
      return { choices: [{ message: { content: '{"findings":[],"claims":[]}' } }] };
    } } };
    models = { list: async () => ({ data: [] }) };
  },
}));
process.env.GROQ_API_KEY = "test";
process.env.GUIDEWISE_AI_CACHE = "off";
delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY;

const { reviewDraft } = await import("../src/lib/engine/review");
const { SEED_FACTS, SEED_KIT, SEED_RULES } = await import("../src/lib/seed");

const PII = [
  { kind: "email", v: "riya.sharma@gmail.com" }, { kind: "email", v: "accounts@preppath-fees.in" },
  { kind: "phone", v: "98765 43210" }, { kind: "phone", v: "+91 99887 76655" }, { kind: "phone", v: "080-4123-5678" },
  { kind: "Aadhaar", v: "2345 6789 0123" }, { kind: "PAN", v: "ABCPS1234K" }, { kind: "card", v: "4111 1111 1111 1111" },
];
const CANARIES = ["ZEBRA-7731-PROJECT", "Operation Monsoon Lift", "Q3 fee hike of 18%"];

describe("privacy evaluation", () => {
  it("no planted personal data and no confidential canary reaches the AI", async () => {
    let drafts = 0, sent = 0;
    for (const p of PII) {
      for (const tmpl of ["For fees, contact {v} today. 100% selection guaranteed!", "Your seat is assured. Questions: {v}.", "Pay at the counter or quote {v} on the form."]) {
        drafts++;
        await reviewDraft(tmpl.replace("{v}", p.v), null, SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: true, contentType: "social" });
      }
    }
    for (const c of CANARIES) {
      drafts++;
      await reviewDraft(`Internal: ${c}. The best coaching in India, guaranteed.`, { goal: "", audience: "", cta: "", confidential: true }, SEED_RULES, SEED_FACTS, SEED_KIT, { useAI: true });
    }
    sent = prompts.length;
    const all = prompts.join("\n");
    const leaks = [...PII.map((p) => p.v), ...CANARIES].filter((v) => all.includes(v) || all.includes(v.replace(/\s/g, "")));
    console.log(`privacy eval: ${drafts} drafts, ${PII.length} kinds of personal data x3 and ${CANARIES.length} confidential drafts, ${sent} AI prompts captured, leaks: ${leaks.length}`);
    expect(sent).toBeGreaterThan(20); // the AI really was called for the non-confidential drafts
    expect(leaks).toEqual([]);
  });
});

// The AI layer falls through providers: a rate-limited Groq hands over to Gemini,
// and an answer that does not match the schema is rejected rather than trusted.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let groqBehaviour: "rate-limit" | "bad-json" | "ok" = "rate-limit";
const geminiModelsSeen: string[] = [];

vi.mock("groq-sdk", () => ({
  default: class {
    chat = {
      completions: {
        create: async () => {
          calls.push("groq");
          if (groqBehaviour === "rate-limit") throw Object.assign(new Error("Rate limit reached"), { status: 429 });
          if (groqBehaviour === "bad-json") return { choices: [{ message: { content: '{"findings":[{"quote":1}]}' } }] };
          return { choices: [{ message: { content: '{"findings":[{"quote":"best coaching","explanation":"x","fix":"trusted coaching"}]}' } }] };
        },
      },
    };
  },
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      list: async () => [
        { name: "models/gemini-2.5-flash", supportedActions: ["generateContent"] },
        { name: "models/gemini-3.5-flash-lite", supportedActions: ["generateContent"] },
        { name: "models/gemini-3.5-flash", supportedActions: ["generateContent"] },
        { name: "models/gemini-3.5-flash-image", supportedActions: ["generateContent"] },
      ],
      generateContent: async ({ model }: { model: string }) => {
        calls.push("gemini");
        geminiModelsSeen.push(model);
        if (model === "gemini-flash-latest") throw Object.assign(new Error("models/gemini-flash-latest is not found"), { status: 404 });
        return { text: '{"findings":[{"quote":"best coaching","explanation":"from gemini","fix":"trusted coaching"}]}' };
      },
    };
  },
}));

process.env.GROQ_API_KEY = "test";
process.env.GEMINI_API_KEY = "test";
delete process.env.ANTHROPIC_API_KEY;

const { aiModel, judgeRule } = await import("../src/lib/engine/ai");
const { SEED_RULES } = await import("../src/lib/seed");
const rule = SEED_RULES.find((r) => r.id === "R-08")!;

beforeEach(() => { calls.length = 0; });

describe("provider chain", () => {
  it("lists Groq first, then Gemini", () => {
    expect(aiModel()).toMatch(/^Groq .* then Gemini/);
  });
  it("falls through to Gemini when Groq is rate-limited, and finds a Gemini model the key can use", async () => {
    groqBehaviour = "rate-limit";
    const out = await judgeRule(rule, "The best coaching in Chennai.", null);
    expect(out[0].explanation).toBe("from gemini");
    // one Groq retry, then Gemini: its default name 404s, so it picks the newest non-lite Flash model and retries
    expect(calls).toEqual(["groq", "groq", "gemini", "gemini"]);
    expect(geminiModelsSeen).toEqual(["gemini-flash-latest", "gemini-3.5-flash"]);
    expect(aiModel()).toMatch(/Gemini \(gemini-3.5-flash\)/);
  }, 15000);
  it("rejects an answer that does not match the schema", async () => {
    groqBehaviour = "bad-json";
    const out = await judgeRule(rule, "The best coaching in Chennai.", null);
    expect(calls).toEqual(["groq", "gemini"]);
    expect(out[0].explanation).toBe("from gemini");
  });
  it("uses Groq when it answers", async () => {
    groqBehaviour = "ok";
    const out = await judgeRule(rule, "The best coaching in Chennai.", null);
    expect(calls).toEqual(["groq"]);
    expect(out[0].fix).toBe("trusted coaching");
  });
});

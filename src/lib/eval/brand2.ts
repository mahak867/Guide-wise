// Second evaluation brand: Suraksha Health, a fictional Indian health insurer. Written by the team.
// It exists only for the evaluation, so the rules are measured on a second, different domain.
// It is not part of the demo workspace seed. It uses only rule categories the engine already has.
// The 40 labelled drafts below were written, with their labels, before the checker was run on them.
// All 40 are held out ("test"): none were used while building the rules.

import type { Fact, Kit, Rule } from "../types";
import type { EvalDoc } from "./dataset";

const DISC = "Insurance is the subject matter of solicitation. Read the policy wording carefully before buying.";
const GUIDE = "Suraksha Health brand guide";
const IRDAI = "IRDAI (Insurance Advertisements and Disclosure) Regulations, as summarised in the Suraksha Health brand guide";

export const BRAND2_KIT: Kit = {
  id: 2,
  name: "Suraksha Health",
  version: 1,
  palette: [
    { name: "Suraksha Blue", hex: "#1C4E80" },
    { name: "Ink", hex: "#1A1F2B" },
    { name: "Cloud", hex: "#F1F5F9" },
    { name: "Coral", hex: "#E8735A" },
  ],
  disclaimers: [{ id: "SD-1", text: DISC, when: "Any post that mentions a premium or the claim settlement ratio" }],
  contacts: [
    { label: "Customer care email", value: "care@surakshahealth.in" },
    { label: "Toll-free helpline", value: "1800 266 7780" },
  ],
  logo: null,
  profile: { sector: "Health insurance" },
};

const fact = (f: Partial<Fact> & Pick<Fact, "id" | "statement" | "value" | "keywords" | "evidence">): Fact => ({
  kind: "fact", owner: "Nandini (Compliance)", valid_from: "2026-04-01", valid_until: "2027-03-31",
  disclosure: "", disclosure_keywords: [], meta: {}, ...f,
});

export const BRAND2_FACTS: Fact[] = [
  fact({ id: "SF-1", value: 98.2, statement: "Claim settlement ratio of 98.2% in FY 2025-26", keywords: ["claim settlement", "settlement ratio", "settled", "settle"],
    evidence: "Public disclosure NL-37, FY 2025-26", disclosure: "Name the financial year (FY 2025-26)", disclosure_keywords: ["FY 2025-26"] }),
  fact({ id: "SF-2", value: 96, statement: "Claim settlement ratio of 96% in FY 2023-24", keywords: ["claim settlement", "settlement ratio", "settled", "settle"],
    evidence: "Public disclosure NL-37, FY 2023-24", valid_from: "2024-04-01", valid_until: "2025-03-31", meta: { superseded_by: "SF-1" } }),
  fact({ id: "SF-3", value: 12000, statement: "12,000+ network hospitals offer cashless treatment", keywords: ["hospitals", "network", "cashless"],
    evidence: "Network hospital list, October 2026 (internal)" }),
  fact({ id: "SF-4", value: 250000, statement: "250,000+ families are insured with Suraksha Health", keywords: ["families", "customers", "insured", "policyholders"],
    evidence: "Policy administration export, September 2026 (internal)" }),
  fact({ id: "SF-5", value: 499, statement: "Premiums start at ₹499 a month for a 30-year-old", keywords: ["premium", "premiums", "month", "start"],
    evidence: "Rate card RC-2026-02", disclosure: "Name the age the price is for (a 30-year-old)", disclosure_keywords: ["30-year-old"] }),
  fact({ id: "SF-6", value: 30, statement: "Cashless approval in 30 minutes on average", keywords: ["minutes", "approval", "approved"],
    evidence: "Claims operations dashboard, Q2 FY 2026-27 (internal)" }),
  fact({ id: "SF-7", value: 1800, statement: "1,800+ day-care procedures are covered", keywords: ["day-care", "procedures"],
    evidence: "Policy wording SH-FF-2026, annexure B" }),
];

const r = (x: Omit<Rule, "status" | "tests" | "precedent" | "risk"> & Partial<Pick<Rule, "risk" | "status">>): Rule => ({
  status: "enforced", risk: "low", tests: [], precedent: null, ...x,
});

export const BRAND2_RULES: Rule[] = [
  r({ id: "SH-GUAR", kind: "judgment", category: "claim", severity: "critical", source: IRDAI, risk: "high",
    title: "No guaranteed claims", description: "Never promise that a claim will be approved, paid or settled. Every claim is assessed under the policy wording.",
    config: { patterns: [
      "100\\s?%\\s+claims?\\s+(?:settlement|approval|payout)s?",
      "guaranteed?\\s+(?:claims?|approval|payouts?|settlement|cover)(?:\\s+approval)?",
      "assured\\s+(?:claims?|payouts?|approval|settlement)",
      "no\\s+questions\\s+asked",
    ], guidance: "Also flag promises in other words, such as \"every claim will be paid\"." } }),
  r({ id: "SH-SUP", kind: "judgment", category: "claim", severity: "major", source: GUIDE, risk: "high",
    title: "Superlatives need an approved fact", description: "\"No. 1\", \"best\" or \"lowest\" may only be used with an approved fact.",
    config: { patterns: [
      "(?:India'?s\\s+)?(?:#\\s?1|No\\.?\\s?1|number\\s+one)\\s+(?:health\\s+)?insur(?:er|ance(?:\\s+company)?)",
      "\\bbest\\s+(?:health\\s+)?(?:insurer|insurance|plan|policy|cover)(?:\\s+plan)?\\b",
      "\\blowest\\s+premiums?\\b",
    ] } }),
  r({ id: "SH-CLAIM", kind: "code", category: "claims", severity: "critical", source: IRDAI, risk: "high",
    title: "Numbers must match the Facts Register", description: "Every figure must match an approved fact that is valid today, with its disclosure.", config: {} }),
  r({ id: "SH-DISC", kind: "code", category: "disclaimer", severity: "major", source: IRDAI, risk: "high",
    title: "Premiums and claim ratios need the disclaimer", description: "A post that mentions a premium or the settlement ratio carries disclaimer SD-1.",
    config: { patterns: ["\\bpremiums?\\b", "\\bsettlement\\s+ratio\\b"], fixFactId: "SD-1" } }),
  r({ id: "SH-CONTACT", kind: "code", category: "contact", severity: "major", source: GUIDE,
    title: "Approved contacts only", description: "Use the customer care email and the toll-free helpline, never an agent's personal contact.", config: {} }),
  r({ id: "SH-URG", kind: "judgment", category: "tone", severity: "major", source: GUIDE,
    title: "No pressure selling", description: "Do not rush people into buying insurance. State the real date instead.",
    config: { patterns: ["hurry!*", "last\\s+chance!*", "act\\s+now!*", "only\\s+today!*", "before\\s+it'?s\\s+too\\s+late!*"] } }),
  r({ id: "SH-TONE", kind: "judgment", category: "tone", severity: "minor", source: GUIDE,
    title: "Calm and reassuring", description: "No stacked exclamation marks.", config: { patterns: [{ re: "!{2,}", fix: "." }] } }),
  r({ id: "SH-TERM1", kind: "code", category: "term", severity: "minor", source: GUIDE,
    title: "Say \"health insurance\", not \"mediclaim\"", description: "\"Mediclaim\" is an old product name.",
    config: { avoid: ["mediclaim"], prefer: "health insurance" } }),
  r({ id: "SH-TERM2", kind: "code", category: "term", severity: "minor", source: GUIDE,
    title: "Say \"affordable\", not \"cheap\"", description: "Cheap cover sounds like thin cover.",
    config: { avoid: ["cheap", "cheapest", "cheaper"], prefer: "affordable" } }),
  r({ id: "SH-PAID", kind: "code", category: "requires", severity: "major", source: "ASCI Guidelines for Influencer Advertising in Digital Media (2021)", risk: "high",
    title: "Paid partnerships say so", description: "A creator post paid for by Suraksha Health carries #ad, #sponsored or \"Paid partnership\".",
    config: {
      patterns: [
        String.raw`\b(?:in\s+)?(?:collaboration|collab|partnership)\s+with\b`,
        String.raw`\bsponsored\s+by\b`,
        String.raw`\bthanks?\s+(?:you\s+)?to\s+@[\w.]+`,
        String.raw`\b(?:use|apply|with)\s+my\s+(?:promo\s+|discount\s+|referral\s+)?(?:code|coupon|link)\b`,
      ],
      requires: [String.raw`#ad(?![\w])`, String.raw`#sponsored\b`, String.raw`\bpaid\s+partnership\b`],
      missing: "disclosure label (#ad, #sponsored or \"Paid partnership\")", append: "#ad",
    } }),
  r({ id: "SH-OFFER", kind: "code", category: "requires", severity: "major", source: GUIDE,
    title: "Offers say when they end", description: "A discount, something free or a promo code states when it ends, or carries \"T&C apply\".",
    config: {
      patterns: [
        String.raw`\b\d{1,2}\s?%\s?(?:off|discount)\b`,
        String.raw`\bdiscount(?:s|ed)?\b`,
        String.raw`(?<![\w-])(?<!(?:toll|stress|hassle|duty)\s)free\b`,
        String.raw`\b(?:promo\s+|coupon\s+|discount\s+|referral\s+)?code\s+[a-z]{2,}\d{1,3}\b`,
      ],
      requires: [
        String.raw`\bT\s?&\s?Cs?\b`,
        String.raw`\b(?:ends?|valid|closes?|expires?|till|until|before|by)\b[^.!?\n]{0,25}?(?:\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\b\d{4}-\d{2}-\d{2}\b)`,
      ],
      missing: "end date or \"T&C apply\"",
    } }),
  r({ id: "SH-COMP", kind: "code", category: "competitor", severity: "major", source: GUIDE, risk: "high",
    title: "No competitor names", description: "Do not name another insurer.",
    config: { names: ["Kavach Insure", "Arogya Plus", "Nirbhay General"] } }),
  r({ id: "SH-LINK", kind: "code", category: "pattern", severity: "minor", source: GUIDE,
    title: "No shortened links", description: "Show the full surakshahealth.in address.",
    config: { patterns: [{ re: "(?:https?://)?(?:bit\\.ly|tinyurl\\.com|t\\.co|goo\\.gl|rb\\.gy)/[\\w-]+", fix: "surakshahealth.in/claims" }] } }),
  r({ id: "SH-NAME", kind: "code", category: "brand-name", severity: "minor", source: GUIDE,
    title: "Write \"Suraksha Health\" exactly", description: "Two words, both capitalised.", config: { names: ["Suraksha Health"] } }),
  r({ id: "SH-CAPS", kind: "code", category: "caps", severity: "minor", source: GUIDE,
    title: "No capitals for emphasis", description: "Acronyms such as IRDAI, ICU and OPD are fine.", config: { allow: ["IRDAI", "AYUSH"] } }),
  r({ id: "SH-HID", kind: "code", category: "hidden", severity: "major", source: GUIDE,
    title: "No invisible characters", description: "No zero-width spaces or direction overrides.", config: {} }),
];

type P = EvalDoc["planted"][number];
const d = (n: number, text: string, planted: P[] = []): EvalDoc => ({ id: `B${String(n).padStart(2, "0")}`, split: "test", text, planted });
const p = (rule: string, quote: string, hard?: boolean): P => (hard ? { rule, quote, hard } : { rule, quote });

export const BRAND2_DOCS: EvalDoc[] = [
  // Clean
  d(1, "Suraksha Health family floater plans cover you, your spouse and two children under one sum insured. Write to care@surakshahealth.in to compare plans."),
  d(2, "Cashless treatment at 12,000+ network hospitals across India. Find your nearest hospital at surakshahealth.in/hospitals."),
  d(3, `Our claim settlement ratio was 98.2% in FY 2025-26. ${DISC}`),
  d(4, `Premiums start at ₹499 a month for a 30-year-old. ${DISC}`),
  d(5, "Need help with a claim? Call our toll-free helpline 1800 266 7780, open all day, every day."),
  d(6, "250,000+ families are insured with Suraksha Health. Renew online in five minutes."),
  d(7, "Day-care procedures such as cataract surgery and dialysis are covered. Check the full list in your policy wording."),
  d(8, "Paid partnership with Suraksha Health: here is how I picked a family floater plan for my parents."),
  d(9, "Questions about a policy? Write to care@surakshahealth.in and we reply within one working day."),
  d(10, "Health insurance protects your savings when a hospital stay comes up unexpectedly. Speak to an advisor at care@surakshahealth.in."),
  // Planted, phrased the way the rules expect
  d(11, "Guaranteed claim approval for every policyholder. Write to care@surakshahealth.in to compare plans.", [p("SH-GUAR", "Guaranteed claim approval")]),
  d(12, "100% claim settlement, no questions asked. Renew online in five minutes.", [p("SH-GUAR", "100% claim settlement")]),
  d(13, "India's No. 1 health insurer, trusted by families everywhere.", [p("SH-SUP", "India's No. 1 health insurer")]),
  d(14, "The best health insurance plan for senior citizens. Hurry, buy your policy before the price goes up.", [p("SH-SUP", "best health insurance plan"), p("SH-URG", "Hurry")]),
  d(15, "Lowest premiums in the market, with cover from day one.", [p("SH-SUP", "Lowest premiums"), p("SH-DISC", "premiums")]),
  d(16, `Our claim settlement ratio is 99.5%. ${DISC}`, [p("SH-CLAIM", "99.5%")]),
  d(17, "Cashless treatment at 15,000+ network hospitals. Day-care procedures are covered too.", [p("SH-CLAIM", "15,000+")]),
  d(18, "Over 500,000 families trust Suraksha Health. Write to care@surakshahealth.in to compare plans.", [p("SH-CLAIM", "500,000")]),
  d(19, `Our claim settlement ratio was 96% in FY 2023-24. ${DISC}`, [p("SH-CLAIM", "96%")]),
  d(20, `Premiums start at ₹399 a month. ${DISC}`, [p("SH-CLAIM", "₹399")]),
  d(21, "Premiums start at ₹499 a month. Find your nearest hospital at surakshahealth.in/hospitals.", [p("SH-CLAIM", "₹499"), p("SH-DISC", "Premiums")]),
  d(22, "Email rohit.verma@surakshahealth.in to buy a plan. Act now and protect your family.", [p("SH-CONTACT", "rohit.verma@surakshahealth.in"), p("SH-URG", "Act now")]),
  d(23, "WhatsApp our agent on 98201 44556 for a quote.", [p("SH-CONTACT", "98201 44556")]),
  d(24, `Last chance to lock in this year's premium! ${DISC}`, [p("SH-URG", "Last chance")]),
  d(25, "Compare our mediclaim plans online. Renew online in five minutes.", [p("SH-TERM1", "mediclaim")]),
  d(26, "The cheapest family cover you can buy. Write to care@surakshahealth.in to compare plans.", [p("SH-TERM2", "cheapest")]),
  d(27, "Sponsored by Suraksha Health: my honest review of their family floater.", [p("SH-PAID", "Sponsored by")]),
  d(28, "Use my code MEERA10 to get a discount on Suraksha Health plans.", [p("SH-PAID", "Use my code"), p("SH-OFFER", "discount")]),
  d(29, "Free health check-up when you buy a policy. Day-care procedures are covered too.", [p("SH-OFFER", "Free health check-up")]),
  d(30, "Switching from Kavach Insure? We cover pre-existing conditions sooner.", [p("SH-COMP", "Kavach Insure")]),
  d(31, "Better cover than Arogya Plus, and Suraksha health renews online in five minutes.", [p("SH-COMP", "Arogya Plus"), p("SH-NAME", "Suraksha health")]),
  d(32, "Read our claim guide: bit.ly/sh-claims", [p("SH-LINK", "bit.ly/sh-claims")]),
  d(33, "Your family is protected!! Renew your policy TODAY to stay covered.", [p("SH-TONE", "!!"), p("SH-CAPS", "TODAY")]),
  // Hard phrasings: no keyword pattern is expected to catch these
  d(34, "Every claim you make will be paid in full, whatever happens.", [p("SH-GUAR", "Every claim you make will be paid in full", true)]),
  d(35, "With us, your hospital bills are simply never your problem again. Write to care@surakshahealth.in to compare plans.", [p("SH-GUAR", "your hospital bills are simply never your problem", true)]),
  d(36, "No other insurer in India comes close to our service.", [p("SH-SUP", "No other insurer in India comes close", true)]),
  d(37, "Prices like these won't be around for long, so decide this week.", [p("SH-URG", "Prices like these won't be around for long", true)]),
  d(38, "Nearly half a million families have chosen us.", [p("SH-CLAIM", "Nearly half a million families", true)]),
  d(39, "We settle ninety-nine out of every hundred claims.", [p("SH-CLAIM", "ninety-nine out of every hundred", true)]),
  d(40, "Suraksha Health sent me this plan to try and I love it. DM Ritu from their sales team on Instagram for a quote.", [p("SH-PAID", "Suraksha Health sent me this plan to try", true), p("SH-CONTACT", "DM Ritu from their sales team", true)]),
];

export const BRAND2_EVAL_RULES = new Set(BRAND2_DOCS.flatMap((x) => x.planted.map((q) => q.rule)));

// Planted-error test set for PrepPath Academy (fictional). Written by the team.
// Each draft is built from clean sentences and planted errors with known labels.
// Some errors are deliberately phrased so that keyword patterns miss them ("hard"),
// to measure what the AI checks add and to keep the code-only score honest.

export interface Planted { rule: string; quote: string; hard?: boolean }
export interface EvalDoc { id: string; split: "dev" | "test"; text: string; planted: Planted[] }

const ERRORS: { text: string; rule: string; quote: string; hard?: boolean }[] = [
  { text: "100% selection guaranteed.", rule: "R-12", quote: "100% selection guaranteed" },
  { text: "Guaranteed selection in JEE Main.", rule: "R-12", quote: "Guaranteed selection" },
  { text: "100% result in NEET this year.", rule: "R-12", quote: "100% result" },
  { text: "Your IIT seat is assured with us.", rule: "R-12", quote: "Your IIT seat is assured", hard: true },
  { text: "You will definitely clear JEE with PrepPath.", rule: "R-12", quote: "You will definitely clear JEE", hard: true },
  { text: "India's No. 1 JEE institute.", rule: "R-08", quote: "India's No. 1 JEE institute" },
  { text: "The best coaching in Chennai.", rule: "R-08", quote: "best coaching" },
  { text: "Our faculty is the best in India.", rule: "R-08", quote: "is the best in India" },
  { text: "Unmatched teaching anywhere in the country.", rule: "R-08", quote: "Unmatched teaching anywhere in the country", hard: true },
  { text: "Join 60,000+ students who prepared with us.", rule: "R-CLAIM", quote: "60,000+" },
  { text: "5,000+ JEE selections in 2025.", rule: "R-CLAIM", quote: "5,000+" },
  { text: "Dropper fee just ₹39,999.", rule: "R-CLAIM", quote: "₹39,999" },
  { text: "92% of students rated our faculty 4 stars or more.", rule: "R-CLAIM", quote: "92%" },
  { text: "Write to rahul.k@preppath.in for the fee sheet.", rule: "R-15", quote: "rahul.k@preppath.in" },
  { text: "WhatsApp 98450 12345 for details.", rule: "R-15", quote: "98450 12345" },
  { text: "Congratulations Kabir, AIR 57!", rule: "R-STU", quote: "Kabir, AIR 57" },
  { text: "Meet Aarav, AIR 112.", rule: "R-STU", quote: "Aarav, AIR 112" },
  { text: "Hurry, seats are filling up.", rule: "R-10", quote: "Hurry" },
  { text: "Last chance to enrol!", rule: "R-10", quote: "Last chance" },
  { text: "Only a few seats left.", rule: "R-10", quote: "Only a few seats left" },
  { text: "Don't miss out, the offer ends tonight.", rule: "R-10", quote: "Don't miss out, the offer ends tonight", hard: true },
  { text: "Results are out!!", rule: "T-2", quote: "!!" },
  { text: "Try our AI-powered doubt solver.", rule: "TERM-4", quote: "AI-powered" },
  { text: "The cheapest test series in Chennai.", rule: "TERM-2", quote: "cheapest" },
];

const CLEAN = [
  "4,200+ JEE selections in 2025 from our two-year classroom programme.",
  "50,000+ students have prepared for JEE with PrepPath.",
  "Trusted JEE coaching, taught by IIT-alumni faculty.",
  "Meet Diya (AIR 340, one-year dropper programme).",
  "The next batch starts 1 December.",
  "Write to admissions@preppath.in or call +91 80000 12345.",
  "Our adaptive practice tests adjust to your pace.",
  "Classes run Monday to Saturday, 4 pm to 7 pm.",
  "Best of luck to everyone writing JEE Main in January.",
  "Fees are affordable, and scholarships are available.",
  "A free demo class runs every Sunday.",
  "Mentors hold doubt sessions after every class.",
  "Download the 2025 JEE Advanced paper with solutions.",
  "Batches are kept small so every question gets answered.",
  "Parents get a progress report every month.",
];

// Small deterministic PRNG so the set is the same on every run.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function build(): EvalDoc[] {
  const r = rng(20261113);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const docs: EvalDoc[] = [];
  for (let i = 0; i < 60; i++) {
    const nErr = i % 4 === 0 ? 0 : 1 + Math.floor(r() * 3); // about a quarter left clean
    const used = new Set<string>();
    const errs: (typeof ERRORS)[number][] = [];
    while (errs.length < nErr) {
      const e = pick(ERRORS);
      if (used.has(e.rule)) continue; // one planted error per rule per draft
      used.add(e.rule);
      errs.push(e);
    }
    const clean: string[] = [];
    while (clean.length < 2 + Math.floor(r() * 2)) {
      const c = pick(CLEAN);
      if (!clean.includes(c)) clean.push(c);
    }
    // Fisher-Yates with the seeded PRNG: identical order on every machine and Node version.
    const parts = [...clean, ...errs.map((e) => e.text)];
    for (let k = parts.length - 1; k > 0; k--) {
      const j = Math.floor(r() * (k + 1));
      [parts[k], parts[j]] = [parts[j], parts[k]];
    }
    docs.push({
      id: `D${String(i + 1).padStart(2, "0")}`,
      split: i < 20 ? "dev" : "test",
      text: parts.join(" "),
      planted: errs.map((e) => ({ rule: e.rule, quote: e.quote, hard: e.hard })),
    });
  }
  return docs;
}

export const EVAL_DOCS: EvalDoc[] = build();
export const EVAL_RULES = new Set(ERRORS.map((e) => e.rule));

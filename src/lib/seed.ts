import type { Fact, Kit, Rule } from "./types";

// PrepPath Academy is fictional. Its rules and facts were written by the team for the demo.
// Precedents are real CCPA orders as reported in the press coverage linked beside each one.

export const DEMO_CAPTION =
  "India's #1 JEE coaching. 100% selection guaranteed!! Join 50,000+ toppers who cracked JEE with PrepPath. Meet Aarav, AIR 112! Our AI-powered classes are the best in the country. New Dropper batch at ₹39,999. Fees: email priya.sharma@preppath.in. Enrol today, limited seats!!";

export const DEMO_INTENT = {
  goal: "Get JEE aspirants to enquire about the December batch",
  audience: "Class 11-12 students and droppers preparing for JEE",
  cta: "Enquire about the December batch",
};

export const SEED_KIT: Kit = {
  id: 1,
  name: "PrepPath Academy",
  version: 1,
  palette: [
    { name: "PrepPath Teal", hex: "#0F6B5F" },
    { name: "Ink", hex: "#16211F" },
    { name: "Mist", hex: "#EEF3F1" },
    { name: "Marigold", hex: "#F2A541" },
  ],
  disclaimers: [
    { id: "D-1", text: "Past results do not guarantee future selection.", when: "Any post that mentions selections or ranks" },
    { id: "D-2", text: "Fees are subject to the published fee policy on preppath.in.", when: "Any post that mentions a fee" },
  ],
  contacts: [
    { label: "Admissions email", value: "admissions@preppath.in" },
    { label: "Admissions helpline", value: "+91 80000 12345" },
  ],
  profile: { students_coached: 50000, sector: "JEE and NEET coaching" },
};

export const SEED_FACTS: Fact[] = [
  {
    id: "F-3", kind: "fact", value: 4200,
    statement: "4,200+ JEE selections in 2025 from our two-year classroom programme",
    keywords: ["selection", "selected", "qualified"],
    evidence: "Results audit 2025, sheet 'JEE-Final' (internal)", owner: "Meera (Brand manager)",
    valid_from: "2025-07-01", valid_until: "2027-06-30",
    disclosure: "Name the course the selections came from (two-year classroom programme)",
    disclosure_keywords: ["two-year classroom programme"], meta: {},
  },
  {
    id: "F-5", kind: "fact", value: null,
    statement: "Trusted JEE coaching, taught by IIT-alumni faculty",
    keywords: ["faculty", "iit-alumni"],
    evidence: "Faculty register, November 2026 (internal)", owner: "Meera (Brand manager)",
    valid_from: "2026-01-01", valid_until: "2027-12-31", disclosure: "", disclosure_keywords: [], meta: {},
  },
  {
    id: "F-7", kind: "fact", value: 50000,
    statement: "50,000+ students have prepared for JEE with PrepPath",
    keywords: ["students", "enrolled", "prepared", "aspirants", "learners"],
    evidence: "Enrolment database export, October 2026 (internal)", owner: "Meera (Brand manager)",
    valid_from: "2026-10-01", valid_until: "2027-09-30", disclosure: "", disclosure_keywords: [], meta: {},
  },
  {
    id: "F-9", kind: "fact", value: 39999,
    statement: "Dropper batch fee: ₹39,999",
    keywords: ["dropper", "fee", "batch"],
    evidence: "Fee circular FC-2026-12 (unreleased)", owner: "Kavya (Compliance)",
    valid_from: "2026-12-01", valid_until: "2027-11-30",
    disclosure: "Fees are subject to the published fee policy on preppath.in.",
    disclosure_keywords: ["fee policy"], meta: { embargo_text: "New Dropper batch opening soon" },
  },
  {
    id: "F-11", kind: "fact", value: 92,
    statement: "92% of 2024 classroom students rated their faculty 4 stars or higher",
    keywords: ["rated", "rating", "stars", "satisfaction"],
    evidence: "Student survey 2024", owner: "Meera (Brand manager)",
    valid_from: "2025-01-01", valid_until: "2026-06-30", disclosure: "", disclosure_keywords: [], meta: {},
  },
  {
    id: "S-1", kind: "student", value: null,
    statement: "Aarav Mehta, AIR 112, JEE Advanced 2025",
    keywords: [], evidence: "Admission record PP-22-1871", owner: "Kavya (Compliance)",
    valid_from: null, valid_until: null, disclosure: "", disclosure_keywords: [],
    meta: { name: "Aarav Mehta", rank: "112", course: "two-year classroom programme", result_date: "2025-06-02" },
  },
  {
    id: "S-2", kind: "student", value: null,
    statement: "Diya Nair, AIR 340, JEE Advanced 2025",
    keywords: [], evidence: "Admission record PP-23-0412; consent form CF-0098", owner: "Kavya (Compliance)",
    valid_from: null, valid_until: null, disclosure: "", disclosure_keywords: [],
    meta: { name: "Diya Nair", rank: "340", course: "one-year dropper programme", result_date: "2025-06-02", consent_date: "2025-06-20" },
  },
];

const CCPA = "Guidelines for Prevention of Misleading Advertisement in Coaching Sector, 2024 (CCPA)";

export const SEED_RULES: Rule[] = [
  {
    id: "R-12", kind: "judgment", category: "claim", severity: "critical", status: "enforced", source: CCPA, risk: "high",
    title: "No guaranteed outcomes",
    description: "Never promise or imply a guaranteed selection, rank, result or admission. The coaching guidelines prohibit claims such as \"100% selection\".",
    config: {
      patterns: [
        { re: "100\\s?%\\s+(?:selection|success|results?|placement|pass)(?:\\s+guaranteed?)?!*", factId: "F-3" },
        "guaranteed?\\s+(?:selection|rank|success|admission|results?)!*",
        "assured\\s+(?:selection|rank|success|admission)!*",
      ],
      guidance: "Also flag promises in other words, such as \"you will definitely clear JEE\" or \"selection is certain\". Reporting a past result with its course is allowed.",
    },
    tests: [
      { text: "100% selection guaranteed for every student.", expect: "flag" },
      { text: "Join us and your IIT seat is assured selection.", expect: "flag" },
      { text: "4,200+ JEE selections in 2025 from our two-year classroom programme.", expect: "pass" },
    ],
    precedent: {
      order: "CCPA orders of ₹1 lakh to ₹15 lakh on coaching institutes for selection claims (Dec 2024 to Feb 2026)",
      note: "For example, ₹7 lakh for claiming \"617 selections out of 933\", and ₹15 lakh on a repeat finding, as reported.",
      source: "https://newsonair.gov.in/ccpa-imposes-penalty-on-coaching-institutes-for-misleading-upsc-exam-result-claims",
    },
  },
  {
    id: "R-08", kind: "judgment", category: "claim", severity: "major", status: "enforced", source: "PrepPath brand guide", risk: "high",
    title: "Superlatives need an approved fact",
    description: "Words like \"#1\", \"best\" or \"top\" may only be used when an approved fact in the register supports them.",
    config: {
      patterns: [
        { re: "(?:India'?s\\s+)?(?:#\\s?1|No\\.?\\s?1|number\\s+one)\\s+(?:JEE\\s+|NEET\\s+)?(?:coaching|institute|academy)", factId: "F-5" },
        { re: "(?:are|is)\\s+the\\s+best\\s+in\\s+(?:the\\s+country|India)", fix: "are taught by IIT-alumni faculty" },
        "\\b(?:best|top-ranked|leading)\\s+(?:coaching|institute|academy)\\b",
      ],
      guidance: "Flag any unqualified ranking of PrepPath against others. Describing a feature (\"small batches\") is fine.",
    },
    tests: [
      { text: "India's #1 JEE coaching.", expect: "flag" },
      { text: "Our classes are the best in the country.", expect: "flag" },
      { text: "Trusted JEE coaching, taught by IIT-alumni faculty.", expect: "pass" },
    ],
    precedent: null,
  },
  {
    id: "R-CLAIM", kind: "code", category: "claims", severity: "critical", status: "enforced", source: "PrepPath brand guide", risk: "high",
    title: "Numbers must match the Facts Register",
    description: "Every figure in published content must match an approved fact that is valid today, used for the subject the fact is about, with its required disclosure.",
    config: {},
    tests: [
      { text: "Join 50,000+ toppers who cracked JEE with PrepPath.", expect: "flag" },
      { text: "50,000+ students have prepared for JEE with PrepPath.", expect: "pass" },
      { text: "New Dropper batch at ₹39,999.", expect: "flag" },
    ],
    precedent: null,
  },
  {
    id: "R-STU", kind: "code", category: "student", severity: "critical", status: "enforced", source: CCPA, risk: "high",
    title: "Student results need a course and consent",
    description: "A successful student may be named only with the course they took, and with written consent dated after the result.",
    config: {},
    tests: [
      { text: "Meet Aarav, AIR 112!", expect: "flag" },
      { text: "Meet Diya (AIR 340, one-year dropper programme).", expect: "pass" },
    ],
    precedent: {
      order: "Dikshant IAS and Abhimanu IAS, ₹8 lakh each; Vision IAS, ₹11 lakh (December 2025)",
      note: "Toppers' names and photos used without consent; one topper's course disclosed but not the others', as reported.",
      source: "https://www.storyboard18.com/how-it-works/ccpa-fines-dikshant-ias-abhimanu-ias-rs-8-lakh-each-for-deceptive-upsc-success-claims-83596.htm",
    },
  },
  {
    id: "R-DISC", kind: "code", category: "disclaimer", severity: "major", status: "enforced", source: CCPA, risk: "high",
    title: "Results need the approved disclaimer",
    description: "A post that mentions selections, ranks or results must carry disclaimer D-1, in the same language as the claim.",
    config: { patterns: ["\\bselections?\\b", "\\bAIR\\s*\\d+", "\\btoppers?\\b", "\\branks?\\b", "चयन", "रैंक"], fixFactId: "D-1" },
    tests: [
      { text: "4,200+ JEE selections in 2025 from our two-year classroom programme.", expect: "flag" },
      { text: "4,200+ JEE selections in 2025 from our two-year classroom programme. Past results do not guarantee future selection.", expect: "pass" },
      { text: "2025 में 4,200+ JEE चयन। Past results do not guarantee future selection.", expect: "flag" },
      { text: "Classes start on 1 December.", expect: "pass" },
    ],
    precedent: null,
  },
  {
    id: "R-15", kind: "code", category: "contact", severity: "major", status: "enforced", source: "PrepPath brand guide", risk: "low",
    title: "Approved contacts only",
    description: "Published content uses the approved admissions contacts, never a staff member's personal email or phone number.",
    config: {},
    tests: [
      { text: "Fees: email priya.sharma@preppath.in.", expect: "flag" },
      { text: "Write to admissions@preppath.in.", expect: "pass" },
    ],
    precedent: null,
  },
  {
    id: "R-10", kind: "judgment", category: "tone", severity: "major", status: "enforced", source: "PrepPath brand guide", risk: "low",
    title: "No false urgency",
    description: "Do not pressure the reader with scarcity or countdowns. State the real date or the real number of seats instead.",
    config: {
      patterns: [
        { re: "Enrol\\s+today,?\\s*limited\\s+seats!*", fix: "The next batch starts 1 December." },
        "limited\\s+seats!*", "hurry!*", "last\\s+chance!*", "only\\s+a\\s+few\\s+seats\\s+left!*",
      ],
      guidance: "A real, specific deadline or date is fine.",
    },
    tests: [
      { text: "Enrol today, limited seats!!", expect: "flag" },
      { text: "Hurry, last chance to join!", expect: "flag" },
      { text: "The next batch starts 1 December.", expect: "pass" },
    ],
    precedent: null,
  },
  {
    id: "T-2", kind: "judgment", category: "tone", severity: "minor", status: "enforced", source: "PrepPath brand guide", risk: "low",
    title: "Confident, never hype",
    description: "PrepPath sounds calm and sure of itself. No shouting, no stacked exclamation marks, no words in capitals for emphasis.",
    config: { patterns: [{ re: "!{2,}", fix: "." }], guidance: "One exclamation mark in a friendly greeting is fine." },
    tests: [
      { text: "Results are OUT!! Unbelievable scores!!!", expect: "flag" },
      { text: "Results are out. We're proud of every student.", expect: "pass" },
    ],
    precedent: null,
  },
  {
    id: "TERM-4", kind: "code", category: "term", severity: "minor", status: "enforced", source: "PrepPath brand guide", risk: "low",
    title: "Say \"adaptive practice\", not \"AI-powered\"",
    description: "The product term is \"adaptive practice\".",
    config: { avoid: ["AI-powered", "AI powered", "AI-driven"], prefer: "adaptive practice" },
    tests: [
      { text: "Our AI-powered classes adjust to you.", expect: "flag" },
      { text: "Our adaptive practice classes adjust to you.", expect: "pass" },
    ],
    precedent: null,
  },
  {
    id: "TERM-2", kind: "code", category: "term", severity: "minor", status: "enforced", source: "PrepPath brand guide", risk: "low",
    title: "Say \"affordable\", not \"cheap\"",
    description: "Describe fees as affordable. \"Cheap\" undersells the programme.",
    config: { avoid: ["cheap", "cheapest"], prefer: "affordable" },
    tests: [
      { text: "The cheapest JEE course in Chennai.", expect: "flag" },
      { text: "An affordable JEE course in Chennai.", expect: "pass" },
    ],
    precedent: null,
  },
  {
    id: "VIS-PAL", kind: "code", category: "visual-palette", severity: "major", status: "enforced", source: "PrepPath brand guide", risk: "low",
    title: "Brand colours only",
    description: "Any colour covering a meaningful part of a creative must be a palette colour or a neutral (white, grey, black).",
    config: {},
    tests: [
      { text: "#E53935 55%, #FFFFFF 45%", expect: "flag" },
      { text: "#0F6B5F 60%, #FFFFFF 40%", expect: "pass" },
      { text: "#16211F 70%, #F2A541 30%", expect: "pass" },
    ],
    precedent: null,
  },
  {
    id: "VIS-ALT", kind: "code", category: "visual-alt", severity: "minor", status: "enforced", source: "WCAG 2.2, success criterion 1.1.1", risk: "low",
    title: "Every image needs alt text",
    description: "Each image carries a text alternative that describes it and repeats any words in it.",
    config: {},
    tests: [
      { text: "alt:", expect: "flag" },
      { text: "alt: PrepPath students in a classroom with the text 'December batch starts 1 December'", expect: "pass" },
    ],
    precedent: null,
  },
  {
    id: "VIS-CON", kind: "code", category: "visual-contrast", severity: "minor", status: "advisory", source: "WCAG 2.2, success criterion 1.4.3", risk: "low",
    title: "Readable colour contrast",
    description: "The main colours of a creative should contrast by at least 4.5:1 so text placed on them stays readable.",
    config: { guidance: "Measured on the image's dominant colours, so it is advisory: a reviewer confirms where the text sits." },
    tests: [
      { text: "#F2A541 60%, #FFFFFF 40%", expect: "flag" },
      { text: "#0F6B5F 60%, #FFFFFF 40%", expect: "pass" },
    ],
    precedent: null,
  },
  {
    id: "T-5", kind: "judgment", category: "tone", severity: "minor", status: "advisory", source: "PrepPath brand guide", risk: "low",
    title: "Speak to the student",
    description: "Address the reader directly as \"you\". Avoid talking about students in the third person.",
    config: { guidance: "New rule: advisory until its tests pass and the manager promotes it." },
    tests: [
      { text: "Students who join PrepPath get a personal mentor.", expect: "flag" },
      { text: "When you join PrepPath, you get a personal mentor.", expect: "pass" },
    ],
    precedent: null,
  },
];

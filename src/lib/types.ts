export type Severity = "critical" | "major" | "minor";
export type RuleKind = "code" | "judgment";
export type Role = "creator" | "brand" | "compliance" | "manager";

export interface RuleTest {
  text: string;
  expect: "flag" | "pass";
}

export interface Precedent {
  order: string; // e.g. "Vision IAS, ₹11 lakh, December 2025"
  note: string;
  source: string;
}

/**
 * config by category:
 *  term      { avoid: string[], prefer: string }
 *  pattern   { patterns: string[], fixText?: string, fixFactId?: string }
 *  contact   {}  (uses kit.contacts as the approved list)
 *  claims    {}  (numeric claims vs the Facts Register)
 *  student   { patterns: string[] } (ranked student needs a course + consent record)
 *  brand-name { names: string[] }   (exact spelling and capitals of the brand's names)
 *  caps      { allow?: string[] }   (no words in capitals for emphasis; acronyms allowed)
 *  length    { maxChars: number }   (text past the limit is hidden, e.g. behind "See more")
 *  readability { maxWords?: number } (sentences longer than this are hard to read on a phone)
 *  visual-logo { logo?: { minWidth?: number; clear?: number } } (the Brand Kit logo must appear, large enough, with clear space)
 * judgment rules may also carry { patterns, fixText, fixFactId, guidance } - patterns are
 * the code pre-filter that still works in rules-only mode.
 */
export type PatternEntry = string | { re: string; fix?: string; factId?: string };

export interface Rule {
  id: string;
  kind: RuleKind;
  category: string;
  title: string;
  description: string;
  severity: Severity;
  status: "advisory" | "enforced";
  source: string;
  risk: "low" | "high";
  config: {
    avoid?: string[];
    prefer?: string;
    patterns?: PatternEntry[];
    fixText?: string;
    fixFactId?: string;
    guidance?: string;
    names?: string[];
    allow?: string[];
    maxChars?: number;
    maxWords?: number;
    logo?: { minWidth?: number; clear?: number };
    /** Content types this rule applies to (see CONTENT_TYPES). Empty or missing means all of them. */
    channels?: string[];
  };
  tests: RuleTest[];
  last_test?: { passed: boolean; at: string; mode: string; results: { text: string; expect: string; got: string; ok: boolean }[] } | null;
  precedent?: Precedent | null;
}

export interface Fact {
  id: string;
  kind: "fact" | "student";
  statement: string;
  value: number | null;
  keywords: string[];
  evidence: string;
  owner: string;
  valid_from: string | null;
  valid_until: string | null;
  disclosure: string;
  disclosure_keywords: string[];
  meta: { name?: string; rank?: string; course?: string; consent_date?: string; result_date?: string; embargo_text?: string };
}

export interface Kit {
  id?: number;
  ws?: string;
  name: string;
  version: number;
  palette: { name: string; hex: string }[];
  disclaimers: { id: string; text: string; when: string }[];
  contacts: { label: string; value: string }[];
  /** The approved logo: a site path or a PNG data URL, transparent around the mark. */
  logo?: string | null;
  profile?: { students_coached?: number | null; sector?: string };
}

export interface Intent {
  goal: string;
  audience: string;
  cta: string;
  /** Phrases the writer needs kept, e.g. a campaign name. A fix that removes one is withdrawn. */
  locked?: string[];
  /** The writer marked this draft confidential: it is never sent to an AI service. */
  confidential?: boolean;
}

export interface Finding {
  id?: string;
  rule_id: string;
  fact_id?: string | null;
  check_type: "code" | "claims" | "voice" | "visual";
  location?: string; // "text" or "image:N"
  severity: Severity;
  level: "violation" | "suggestion";
  risk: "low" | "high";
  quote: string;
  message: string;
  rule_text: string;
  fix?: string | null;
  fix_note?: string | null;
  fix_status: "verified" | "withdrawn" | "none";
  /** Who wrote the fix: our code (approved wording) or the AI. AI-written fixes are held to a stricter re-test. */
  origin?: "code" | "ai";
  state?: string;
  dismiss_reason?: string | null;
  resolved_by?: string | null;
  precedent?: Precedent | null;
}

export interface ReviewStats {
  mode: "ai" | "rules-only";
  ms: number;
  codeFindings: number;
  visualFindings?: number;
  images?: number;
  aiFindings: number;
  droppedByVerifier: { reason: string; quote: string; rule_id: string }[];
  fixesWithdrawn: number;
  aiCalls: number;
  aiCached?: number;
  confidential?: boolean;
  redactions: number;
  aiError?: string;
}

export const ROLES: Record<Role, { name: string; title: string }> = {
  creator: { name: "Riya", title: "Content creator" },
  brand: { name: "Arjun", title: "Brand reviewer" },
  compliance: { name: "Kavya", title: "Compliance reviewer" },
  manager: { name: "Meera", title: "Brand manager" },
};

export const CONTENT_TYPES = [
  { v: "social", l: "Social post" },
  { v: "ad", l: "Advertisement" },
  { v: "email", l: "Email" },
  { v: "landing", l: "Landing page" },
  { v: "document", l: "Document or brochure" },
] as const;

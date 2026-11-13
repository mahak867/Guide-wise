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
 *  readability {}
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
  id: number;
  name: string;
  version: number;
  palette: { name: string; hex: string }[];
  disclaimers: { id: string; text: string; when: string }[];
  contacts: { label: string; value: string }[];
}

export interface Intent {
  goal: string;
  audience: string;
  cta: string;
}

export interface Finding {
  id?: string;
  rule_id: string;
  fact_id?: string | null;
  check_type: "code" | "claims" | "voice";
  severity: Severity;
  level: "violation" | "suggestion";
  risk: "low" | "high";
  quote: string;
  message: string;
  rule_text: string;
  fix?: string | null;
  fix_note?: string | null;
  fix_status: "verified" | "withdrawn" | "none";
  state?: string;
  dismiss_reason?: string | null;
  resolved_by?: string | null;
  precedent?: Precedent | null;
}

export interface ReviewStats {
  mode: "ai" | "rules-only";
  ms: number;
  codeFindings: number;
  aiFindings: number;
  droppedByVerifier: { reason: string; quote: string; rule_id: string }[];
  fixesWithdrawn: number;
  aiCalls: number;
  redactions: number;
  aiError?: string;
}

export const ROLES: Record<Role, { name: string; title: string }> = {
  creator: { name: "Riya", title: "Content creator" },
  brand: { name: "Arjun", title: "Brand reviewer" },
  compliance: { name: "Kavya", title: "Compliance reviewer" },
  manager: { name: "Meera", title: "Brand manager" },
};

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
 *  visual-logo { logo?: { minWidth?: number; clear?: number } } (the Brand Kit logo must appear, large enough, with clear space,
 *             in its own colours and proportions)
 *  visual-legibility { minPx?: number } (text read in a creative must be at least this size on a 1080-pixel-wide post)
 *  requires  { patterns: string[], requires: string[], missing: string, append?: string } (a trigger needs one of the required words in the same text,
 *             e.g. paid content needs "#ad"; append is added after the sentence as the fix)
 *  competitor { names: string[] }   (other coaching institutes; naming one is a comparison for the brand manager)
 *  link-text {}                     ("click here", "tap here", "read more" that do not say what they lead to)
 *  hashtag   { words?: string[] }   (multi-word hashtags in lower case; words extend the built-in dictionary used to split them)
 *  excess    { maxEmoji?: number }  (stacked "!!" or "?!", and more emoji than the limit)
 * any code rule may carry { except: string[] }: phrases in which its words are allowed (an amendment can add them).
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
    /** visual-legibility: the smallest type size allowed, in pixels on a 1080-pixel-wide post. */
    minPx?: number;
    /** requires: at least one of these patterns must appear in the same text as a trigger. */
    requires?: string[];
    /** requires: what the required words are, in plain words for the finding, e.g. '#ad, #sponsored or "Paid partnership"'. */
    missing?: string;
    /** requires: words added after the triggering sentence as the fix, e.g. "#ad". */
    append?: string;
    /** hashtag: extra words for splitting lower-case hashtags. */
    words?: string[];
    /** excess: the most emoji a post may carry. */
    maxEmoji?: number;
    /** Any code check (and the code patterns of a judgment rule): phrases in which the rule's words are allowed, e.g. "cheap tricks". */
    except?: string[];
    /** requires: the finding's message, for a required line compiled from a guide (the built-in wording is about paid content and offers). */
    message?: string;
    /** The guide passage the rule was compiled from, quoted exactly; shown under each finding of the rule. */
    source_passage?: string;
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
  /** superseded_by: the fact that replaces this one once it expires, e.g. "F-12". Stored in meta, so no new column. */
  meta: { name?: string; rank?: string; course?: string; consent_date?: string; result_date?: string; embargo_text?: string; superseded_by?: string };
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
  /** Image findings: where in the image, as fractions of its width and height. Not stored (worked out again from the image). */
  region?: { x: number; y: number; w: number; h: number } | null;
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
  assets?: number;
  visionRead?: number;
  visionError?: string;
  people?: number;
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

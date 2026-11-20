import { z } from "zod";
import { CsvError, parseCsv, toCsv } from "./csv";
import { CONTENT_TYPES, type Severity } from "./types";

// Bulk check: up to 50 posts from a pasted list or a CSV content calendar, each run through the same
// code checks as a review, with AI off. Shared by the /bulk page (parsing, summary, CSV download)
// and /api/bulk (validation, result rows), so both agree on the limits.

export const MAX_POSTS = 50;
export const MIN_CHARS = 10;
export const MAX_CHARS = 12000;
const TYPE_VALUES = CONTENT_TYPES.map((t) => t.v) as [string, ...string[]];

export interface BulkPost { text: string; title?: string; content_type?: string; date?: string }
/** A post as read from the page: where it came from ("Post 3", "Row 4") and what is wrong with it, if anything. */
export interface BulkItem extends BulkPost { label: string; error?: string }
export interface Prepared { items: BulkItem[]; problem?: string }

const Post = z.object({
  text: z.string({ error: "text is missing" }).trim()
    .min(MIN_CHARS, `send at least ${MIN_CHARS} characters of post text`)
    .max(MAX_CHARS, "send up to 12,000 characters per post"),
  title: z.string().trim().max(200, "keep the title under 200 characters").optional(),
  content_type: z.enum(TYPE_VALUES, { error: `use one of ${TYPE_VALUES.join(", ")}` }).optional(),
  date: z.string().trim().max(40, "keep the date under 40 characters").optional(),
});
export const BulkBody = z.object({
  posts: z.array(Post, { error: "send posts as a list, for example { \"posts\": [{ \"text\": \"...\" }] }" })
    .min(1, "send at least one post")
    .max(MAX_POSTS, `send up to ${MAX_POSTS} posts at a time`),
}, { error: "send a JSON object with a list of posts, for example { \"posts\": [{ \"text\": \"...\" }] }" });

/** The first problem in a bulk request, naming the post it is in ("Post 3: ..."). */
export function bulkIssue(e: z.ZodError): string {
  const i = e.issues[0];
  const [top, n, field] = i.path;
  if (top === "posts" && typeof n === "number") {
    return `Bad request (post ${n + 1}${field && field !== "text" ? `, ${String(field).replace(/_/g, " ")}` : ""}: ${i.message}).`;
  }
  return `Bad request (${i.message}).`;
}

/** Why a post's text cannot be checked, or null. */
export function textProblem(text: string): string | null {
  const n = text.trim().length;
  if (n < MIN_CHARS) return n ? `is only ${n} character${n === 1 ? "" : "s"}; a post needs at least ${MIN_CHARS}` : "has no text";
  if (n > MAX_CHARS) return `is ${n.toLocaleString("en-IN")} characters; the limit is 12,000 per post`;
  return null;
}

/** A content type as people write it in a spreadsheet ("Social post", "AD", "email") → its value, or null. */
export function contentTypeOf(v: string): string | null {
  const s = v.trim().toLowerCase();
  const t = CONTENT_TYPES.find((c) => c.v === s || c.l.toLowerCase() === s || (s.length > 2 && c.l.toLowerCase().startsWith(s)));
  return t ? t.v : null;
}

function limit(items: BulkItem[]): Prepared {
  const ok = items.filter((i) => !i.error).length;
  return ok > MAX_POSTS
    ? { items, problem: `This list has ${ok} posts. Guidewise checks up to ${MAX_POSTS} at a time, so split it into ${Math.ceil(ok / MAX_POSTS)} runs.` }
    : { items };
}

/** Pasted posts, one per paragraph: a blank line ends a post. */
export function postsFromPaste(text: string, contentType = "social"): Prepared {
  const parts = text.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/).map((p) => p.trim()).filter(Boolean);
  return limit(parts.map((p, i) => {
    const why = textProblem(p);
    return { label: `Post ${i + 1}`, text: p, content_type: contentType, ...(why ? { error: `Post ${i + 1} ${why}.` } : {}) };
  }));
}

const COLUMNS: Record<string, keyof BulkPost> = {
  text: "text", post: "text", caption: "text", copy: "text",
  title: "title", name: "title",
  content_type: "content_type", type: "content_type", channel: "content_type",
  date: "date", publish_date: "date",
};

/** A content calendar exported as CSV: a header row naming a "text" column, and optional title, content_type and date. */
export function postsFromCsv(csv: string): Prepared {
  let rows: string[][];
  try {
    rows = parseCsv(csv);
  } catch (e) {
    return { items: [], problem: e instanceof CsvError ? e.message : "This file could not be read as CSV." };
  }
  const numbered = rows.map((r, i) => ({ r, n: i + 1 })).filter(({ r }) => r.some((c) => c.trim()));
  if (!numbered.length) return { items: [], problem: "This file is empty." };
  const [head, ...body] = numbered;
  const cols = head.r.map((h) => COLUMNS[h.trim().toLowerCase().replace(/[\s-]+/g, "_")]);
  const at = (k: keyof BulkPost) => cols.indexOf(k);
  if (at("text") < 0) {
    return { items: [], problem: `The first row must name the columns, with one called "text" for the post. This file's first row is: ${head.r.slice(0, 6).map((c) => `"${c.trim().slice(0, 30)}"`).join(", ")}.` };
  }
  if (!body.length) return { items: [], problem: "This file has a header row but no posts under it." };
  return limit(body.map(({ r, n }) => {
    const get = (k: keyof BulkPost) => (at(k) >= 0 ? (r[at(k)] ?? "").trim() : "");
    const label = `Row ${n}`;
    const text = get("text");
    const typeIn = get("content_type");
    const type = typeIn ? contentTypeOf(typeIn) : "social";
    const errors: string[] = [];
    const why = textProblem(text);
    if (why) errors.push(`the text ${why}`);
    if (!type) errors.push(`the content type "${typeIn.slice(0, 30)}" is not one of ${CONTENT_TYPES.map((c) => c.v).join(", ")}`);
    if (get("title").length > 200) errors.push("the title is longer than 200 characters");
    if (get("date").length > 40) errors.push("the date is longer than 40 characters");
    const item: BulkItem = { label, text, content_type: type ?? "social" };
    if (get("title")) item.title = get("title");
    if (get("date")) item.date = get("date");
    if (errors.length) item.error = `${label}: ${errors.join("; ")}.`;
    return item;
  }));
}

// ---------- Results ----------

export interface BulkFinding { rule_id: string; rule_title: string; severity: Severity; level: "violation" | "suggestion"; quote: string; message: string }
export interface BulkResult {
  index: number;
  verdict: "ready_for_review" | "fix_before_publishing";
  counts: Record<Severity, number>;
  violations: number;
  findings: number;
  /** Every rule this post breaks, once each. */
  broken: { rule_id: string; rule_title: string }[];
  /** The most serious findings first, at most three. */
  top: BulkFinding[];
}
/** What checkDraft returns, as far as a bulk row needs it. */
interface CheckOut { verdict: string; findings: { rule_id: string; severity: Severity; level: "violation" | "suggestion"; quote: string; message: string }[] }

const RANK: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };

export function bulkRow(index: number, check: CheckOut, titles: Map<string, string>): BulkResult {
  const title = (id: string) => titles.get(id) ?? id;
  const counts: Record<Severity, number> = { critical: 0, major: 0, minor: 0 };
  for (const f of check.findings) counts[f.severity]++;
  const sorted = [...check.findings].sort((a, b) => (a.level === b.level ? 0 : a.level === "violation" ? -1 : 1) || RANK[a.severity] - RANK[b.severity]);
  const broken = [...new Set(check.findings.filter((f) => f.level === "violation").map((f) => f.rule_id))].map((id) => ({ rule_id: id, rule_title: title(id) }));
  return {
    index,
    verdict: check.verdict === "fix_before_publishing" ? "fix_before_publishing" : "ready_for_review",
    counts,
    violations: check.findings.filter((f) => f.level === "violation").length,
    findings: check.findings.length,
    broken,
    top: sorted.slice(0, 3).map((f) => ({ rule_id: f.rule_id, rule_title: title(f.rule_id), severity: f.severity, level: f.level, quote: f.quote, message: f.message })),
  };
}

export const VERDICT: Record<BulkResult["verdict"], string> = { ready_for_review: "Ready for review", fix_before_publishing: "Needs fixes" };

export function summarise(results: BulkResult[]) {
  const by = new Map<string, { rule_id: string; rule_title: string; posts: number }>();
  for (const r of results) for (const b of r.broken) {
    const e = by.get(b.rule_id) ?? { ...b, posts: 0 };
    e.posts++;
    by.set(b.rule_id, e);
  }
  return {
    total: results.length,
    ready: results.filter((r) => r.verdict === "ready_for_review").length,
    fix: results.filter((r) => r.verdict === "fix_before_publishing").length,
    common: [...by.values()].sort((a, b) => b.posts - a.posts || a.rule_id.localeCompare(b.rule_id)).slice(0, 3),
  };
}

/** The results as a spreadsheet: one row per post, the findings quoted. */
export function resultsCsv(posts: BulkItem[], results: BulkResult[]): string {
  return toCsv([
    ["row", "title", "date", "content_type", "verdict", "critical", "major", "minor", "rules_broken", "top_findings", "text"],
    ...results.map((r) => {
      const p = posts[r.index];
      return [
        p.label, p.title ?? "", p.date ?? "", p.content_type ?? "social", VERDICT[r.verdict],
        r.counts.critical, r.counts.major, r.counts.minor,
        r.broken.map((b) => `${b.rule_id} ${b.rule_title}`).join("; "),
        r.top.map((f) => `${f.rule_id} ${f.rule_title}: "${f.quote}"`).join("; "),
        p.text,
      ];
    }),
  ]);
}

// ---------- Sample ----------

/** Six December posts for PrepPath: three use only approved facts and wording, three break rules from the demo Brand Kit. */
export const SAMPLE_CALENDAR: BulkPost[] = [
  { date: "2026-12-01", title: "Results post", content_type: "social",
    text: "4,200+ JEE selections in 2025 from our two-year classroom programme. Past results do not guarantee future selection. The December batch starts 1 December. Questions: admissions@preppath.in" },
  { date: "2026-12-03", title: "December batch push", content_type: "social",
    text: "Results are OUT!! 100% selection guaranteed for every student who joins PrepPath this year. Enrol today, limited seats!!" },
  { date: "2026-12-05", title: "Newsletter: how practice adapts", content_type: "email",
    text: "Our adaptive practice classes adjust to how you learn. 50,000+ students have prepared for JEE with PrepPath. Write to admissions@preppath.in to book a free demo class." },
  { date: "2026-12-08", title: "Dropper batch ad", content_type: "ad",
    text: "India's #1 JEE coaching, now with AI-powered classes. New Dropper batch at ₹39,999. Fees: email priya.sharma@preppath.in." },
  { date: "2026-12-10", title: "Student story: Diya", content_type: "social",
    text: "Meet Diya (AIR 340, one-year dropper programme). She practised every evening in our doubt-clearing sessions. Past results do not guarantee future selection. Read her story on preppath.in/stories." },
  { date: "2026-12-12", title: "Chennai centre", content_type: "social",
    text: "The cheapest JEE course in Chennai! Meet Aarav, AIR 112! Join Preppath before the December batch fills up." },
];

/** The sample calendar as the CSV a team would upload, so it goes through the same reader as a real file. */
export const SAMPLE_CSV = toCsv([["date", "title", "content_type", "text"], ...SAMPLE_CALENDAR.map((p) => [p.date, p.title, p.content_type, p.text])]);
/** An empty calendar to fill in. */
export const TEMPLATE_CSV = toCsv([["date", "title", "content_type", "text"], ["2026-12-01", "Example post", "social", "Write the post here. Commas, quotes and line breaks are fine inside a spreadsheet cell."]]);

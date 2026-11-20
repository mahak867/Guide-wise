// Channel preview: how much of a draft a reader sees on each channel before the text is cut off,
// and whether the disclaimer, the call to action or the offer falls after the cut.
// Pure functions, so the cut and the warnings are unit-tested (tests/preview.test.ts).
// The cut-off lengths are approximate: each app also cuts by width and line count, and it varies by device.

export type Channel = "instagram" | "linkedin" | "facebook" | "whatsapp" | "email" | "screen";

export interface ChannelSpec {
  label: string;
  /** Graphemes shown before the cut, or null when the whole text is shown. */
  chars: number | null;
  /** Line breaks after which the text is cut, or null. */
  lines: number | null;
  /** What the app shows at the cut, e.g. "… more". */
  more: string;
  /** Where something past the cut is, in words: "after the cut". */
  after: string;
  /** What the reader does to see the rest: "tapping “… more”". */
  action: string;
}

export const CHANNELS: Record<Channel, ChannelSpec> = {
  instagram: { label: "Instagram", chars: 125, lines: 2, more: "… more", after: "after the cut", action: "tapping “… more”" },
  linkedin: { label: "LinkedIn", chars: 210, lines: 3, more: "…see more", after: "after the cut", action: "tapping “…see more”" },
  facebook: { label: "Facebook ad", chars: 125, lines: null, more: "See more", after: "after the cut", action: "tapping “See more”" },
  whatsapp: { label: "WhatsApp", chars: null, lines: null, more: "", after: "after the cut", action: "" },
  email: { label: "Email", chars: 90, lines: null, more: "…", after: "outside the inbox preview", action: "opening the email" },
  screen: { label: "First screen", chars: 300, lines: null, more: "", after: "below the first screen", action: "scrolling" },
};
export const CHANNEL_ORDER: Channel[] = ["instagram", "linkedin", "facebook", "whatsapp", "email", "screen"];

/** The tab opened for a content type (see CONTENT_TYPES). */
export function defaultChannel(contentType: string): Channel {
  return ({ social: "instagram", ad: "facebook", email: "email", landing: "screen", document: "screen" } as Record<string, Channel>)[contentType] ?? "instagram";
}

// ---------- Graphemes: what a reader counts as one character (an emoji, a flag, a Devanagari syllable) ----------

type Seg = { segment(s: string): Iterable<{ index: number }> };
const segmenter: Seg | null = typeof Intl !== "undefined" && "Segmenter" in Intl
  ? new (Intl as unknown as { Segmenter: new (l?: string, o?: { granularity: string }) => Seg }).Segmenter(undefined, { granularity: "grapheme" })
  : null;

/** Code-unit offsets where each grapheme starts, followed by the string's length. */
export function graphemeStarts(s: string): number[] {
  const out: number[] = [];
  if (segmenter) for (const g of segmenter.segment(s)) out.push(g.index);
  else { let i = 0; for (const ch of s) { out.push(i); i += ch.length; } } // code points: never splits a surrogate pair
  out.push(s.length);
  return out;
}
export const countGraphemes = (s: string) => graphemeStarts(s).length - 1;

/** The first n graphemes of s, never splitting one. */
export function truncateGraphemes(s: string, n: number): string {
  const b = graphemeStarts(s);
  return n >= b.length - 1 ? s : s.slice(0, b[Math.max(0, n)]);
}

/**
 * Where a channel cuts this text, as a code-unit offset at a grapheme boundary (s.length when nothing is cut).
 * The cut is at the character limit or the line limit, whichever comes first; a cut inside a word moves back
 * to the space before it when one is near, as the apps do, so a word is not shown half.
 */
export function cutIndex(s: string, chars: number | null, lines: number | null): number {
  let cut = s.length;
  if (lines != null) {
    let at = -1;
    for (let k = 0; k < lines; k++) { at = s.indexOf("\n", at + 1); if (at < 0) break; }
    if (at >= 0) cut = at;
  }
  if (chars != null) {
    const b = graphemeStarts(s);
    if (b.length - 1 > chars) {
      let c = b[chars];
      if (/\S/.test(s[c - 1] ?? "") && /\S/.test(s[c] ?? "")) {
        const back = s.slice(0, c).search(/\s\S*$/);
        if (back >= 0 && countGraphemes(s.slice(back, c)) <= 20) c = back;
      }
      cut = Math.min(cut, c);
    }
  }
  return cut;
}

// ---------- Rich text: hashtags and mentions (social), *bold* _italic_ ~strike~ (WhatsApp) ----------

export type Token = { t: "text" | "tag" | "mention" | "bold" | "italic" | "strike"; v: string };

const SOCIAL = /(^|[^\p{L}\p{N}\p{M}_&@.#])([#@])([\p{L}\p{N}\p{M}_]+(?:\.[\p{L}\p{N}_]+)*)/gu;
const WA = /(^|[\s(])([*_~])(\S(?:[^\n]*?\S)?)\2(?=$|[\s.,!?:;)])/g;

export function tokens(s: string, channel: Channel): Token[] {
  const out: Token[] = [];
  const push = (t: Token["t"], v: string) => { if (!v) return; const last = out[out.length - 1]; if (t === "text" && last?.t === "text") last.v += v; else out.push({ t, v }); };
  let i = 0;
  if (channel === "instagram" || channel === "linkedin" || channel === "facebook") {
    for (const m of s.matchAll(SOCIAL)) {
      const [, pre, sign, word] = m;
      // A hashtag needs a letter ("#1" is not one); a mention never ends with a full stop.
      if (sign === "#" && !/\p{L}/u.test(word)) continue;
      const start = (m.index ?? 0) + pre.length;
      push("text", s.slice(i, start));
      push(sign === "#" ? "tag" : "mention", sign + word);
      i = start + 1 + word.length;
    }
  } else if (channel === "whatsapp") {
    for (const m of s.matchAll(WA)) {
      const [whole, pre, mark, inner] = m;
      const start = (m.index ?? 0) + pre.length;
      push("text", s.slice(i, start));
      push(mark === "*" ? "bold" : mark === "_" ? "italic" : "strike", inner);
      i = (m.index ?? 0) + whole.length;
    }
  }
  push("text", s.slice(i));
  return out;
}

// ---------- What a reader sees before the cut ----------

export type Status = "seen" | "after" | "split" | "missing";
export interface Item {
  kind: "disclaimer" | "claim" | "cta" | "price" | "code";
  label: string;
  /** The words found in the draft (or, when missing, the words expected). */
  quote: string;
  status: Status;
  /** 1-based character (grapheme) position where it starts in the text as shown. */
  at?: number;
  required?: boolean;
  note?: string;
}
export interface Warning { tone: "warn" | "note"; text: string }

export interface PreviewInput {
  text: string;
  title?: string;
  channel: Channel;
  /** The Brand Kit's disclaimers. */
  disclaimers?: { id: string; text: string }[];
  /** Enforced disclaimer rules for this content type: the disclaimer they require and the words that make it necessary. */
  required?: { id: string; patterns: (string | { re: string })[] }[];
  /** The call to action from the intent field. */
  cta?: string;
}

export interface Preview {
  channel: Channel;
  spec: ChannelSpec;
  /** Email only: the subject line and where it came from. */
  subject: string | null;
  subjectFrom: "subject line" | "title" | "first line" | null;
  /** The text as the channel lays it out (email: the body with spaces collapsed, as an inbox shows it). */
  body: string;
  visible: string;
  hidden: string;
  cut: boolean;
  /** Graphemes of the body shown before the cut, and in all. */
  shown: number;
  total: number;
  items: Item[];
  warnings: Warning[];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Find a phrase ignoring case, spacing and a final full stop. */
export function locate(hay: string, phrase: string): { start: number; end: number } | null {
  const words = phrase.trim().replace(/[.!]+$/, "").split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const m = new RegExp(words.map(esc).join("\\s+"), "iu").exec(hay);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

const CTA_VERBS = /(?:^|[^\p{L}])((?:enrol(?:l)?|enquire|apply|register|sign up|book|call|dm us|message us|whatsapp us|visit|download|reserve|contact us|write to)\b[^.!?\n]{0,40})/iu;
const STOP = new Set(["the", "a", "an", "our", "your", "to", "for", "and", "now", "more", "this", "with"]);
const PRICE = /(?:₹|\bRs\.?\s?|\bINR\s?)\d[\d,]*(?:\.\d+)?(?:\s?(?:lakh|crore))?/i;
const CODE = /\b(?:code|coupon)\s*:?\s+([A-Z0-9]{4,})\b/;

/**
 * Lay out a draft for one channel: the cut, what falls after it, and the warnings.
 * `at` positions and the cut are in graphemes, so an emoji counts as one character, as readers count it.
 */
export function analysePreview(input: PreviewInput): Preview {
  const spec = CHANNELS[input.channel];
  const raw = input.text.replace(/\r\n?/g, "\n").trim();
  let subject: string | null = null;
  let subjectFrom: Preview["subjectFrom"] = null;
  let body = raw;
  if (input.channel === "email") {
    const [first, ...rest] = raw.split("\n");
    const line = /^subject\s*:\s*(.*)$/i.exec(first ?? "");
    if (line) { subject = line[1].trim(); subjectFrom = "subject line"; body = rest.join("\n"); }
    else if (input.title?.trim()) { subject = input.title.trim(); subjectFrom = "title"; }
    else if (rest.join("").trim()) { subject = first.trim(); subjectFrom = "first line"; body = rest.join("\n"); }
    body = body.replace(/\s+/g, " ").trim();
  }
  const at = cutIndex(body, spec.chars, spec.lines);
  const visible = body.slice(0, at).replace(/\s+$/, "");
  const hidden = body.slice(at).replace(/^\s+/, "");
  const cut = !!hidden;

  // Everything is located in one string: for email, the subject (always seen) then the body.
  const head = subject != null ? subject + "\n" : "";
  const full = head + body;
  const cutAt = head.length + at;
  const statusOf = (r: { start: number; end: number }): Status => (r.end <= cutAt ? "seen" : r.start >= cutAt ? "after" : "split");
  const pos = (start: number) => countGraphemes(full.slice(head.length && start >= head.length ? head.length : 0, start)) + 1;
  const items: Item[] = [];
  const warnings: Warning[] = [];
  const after = spec.after;
  const action = spec.action ? ` before ${spec.action}` : "";
  const firstN = spec.chars ? ` in the first ${spec.chars} characters` : "";

  // Disclaimers: each one in the draft, and each one a rule requires here. The words that require one are looked for
  // outside the disclaimers themselves ("Past results do not guarantee future selection" mentions "selection").
  const soft = input.channel === "email"; // an email shows everything once opened, so only the inbox preview is cut
  const found = (input.disclaimers ?? []).map((d) => ({ d, where: locate(full, d.text) }));
  let masked = full;
  for (const { where } of found) if (where) masked = masked.slice(0, where.start) + " ".repeat(where.end - where.start) + masked.slice(where.end);
  const claims = new Map<string, { start: number; end: number; word: string }>(); // disclaimer id -> the words that require it
  for (const r of input.required ?? []) {
    let hit: RegExpExecArray | null = null;
    for (const p of r.patterns) {
      let re: RegExp | null = null;
      try { re = new RegExp(typeof p === "string" ? p : p.re, "iu"); } catch { re = null; }
      const m = re?.exec(masked) ?? null;
      if (m && m[0].trim() && (!hit || m.index < hit.index)) hit = m;
    }
    if (hit && !claims.has(r.id)) claims.set(r.id, { start: hit.index, end: hit.index + hit[0].length, word: hit[0] });
  }
  for (const { d, where } of found) {
    const claim = claims.get(d.id);
    if (!where && !claim) continue;
    if (!where) {
      items.push({ kind: "disclaimer", label: `Disclaimer ${d.id}`, quote: d.text, status: "missing", required: true, note: `required, because the draft mentions “${claim!.word}”` });
      warnings.push({ tone: "warn", text: `Disclaimer ${d.id} (“${d.text}”) is required, because the draft mentions “${claim!.word}”, but it is not in the draft.${spec.chars && !soft ? ` Add it${firstN}.` : ""}` });
      continue;
    }
    const st = statusOf(where);
    items.push({ kind: "disclaimer", label: `Disclaimer ${d.id}`, quote: full.slice(where.start, where.end), status: st, at: pos(where.start), required: !!claim });
    if (st === "seen" || soft) continue;
    if (claim && statusOf(claim) === "seen") {
      warnings.push({ tone: "warn", text: `A reader sees the results claim (“${claim.word}”)${action}, but disclaimer ${d.id} is ${st === "split" ? "cut in half" : after}. Move it${firstN || " up"}.` });
    } else {
      warnings.push({ tone: claim ? "warn" : "note", text: `Disclaimer ${d.id} is ${st === "split" ? "cut in half" : after}.` });
    }
  }
  for (const [id, c] of claims) items.push({ kind: "claim", label: `Results claim (needs ${id})`, quote: c.word, status: statusOf(c), at: pos(c.start) });

  // Call to action: the intent's own words, else its first word ("Enquire", "Enrol"), else the first call to action in the draft.
  const cta = (input.cta ?? "").trim();
  let hit: { start: number; end: number } | null = cta ? locate(full, cta) : null;
  let how = "";
  if (!hit && cta) {
    const verb = cta.split(/\s+/)[0].toLowerCase().replace(/[^\p{L}]/gu, "");
    if (verb.length >= 3 && !STOP.has(verb)) {
      const stem = verb.length > 4 ? verb.replace(/(e|y|ing|ed|s)$/, "") : verb;
      const m = new RegExp(`(?:^|[^\\p{L}])(${esc(stem)}\\p{L}*[^.!?\\n]{0,40})`, "iu").exec(full);
      if (m) { const s = m.index + m[0].length - m[1].length; hit = { start: s, end: s + m[1].replace(/[\s,;:]+$/, "").length }; how = `Your call to action “${cta}” is not in the draft word for word; the nearest is`; }
    }
  }
  if (!hit) {
    const m = CTA_VERBS.exec(full);
    if (m) { const s = m.index + m[0].length - m[1].length; hit = { start: s, end: s + m[1].replace(/[\s,;:]+$/, "").length }; how = cta ? `Your call to action “${cta}” is not in the draft; the nearest is` : ""; }
  }
  if (hit) {
    const quote = full.slice(hit.start, hit.end).trim();
    const st = statusOf(hit);
    items.push({ kind: "cta", label: "Call to action", quote, status: st, at: pos(hit.start), note: how ? "nearest match" : cta ? "from the intent" : "found in the draft" });
    if (how) warnings.push({ tone: "note", text: `${how} “${quote}”.` });
    if (st !== "seen") warnings.push({ tone: soft ? "note" : "warn", text: `The call to action (“${quote}”) is ${st === "split" ? "cut in half" : after}: a reader sees it only after ${spec.action || "reading on"}.` });
  } else if (cta) {
    items.push({ kind: "cta", label: "Call to action", quote: cta, status: "missing", note: "from the intent" });
    warnings.push({ tone: "warn", text: `The call to action from the intent (“${cta}”) is not in the draft.` });
  }

  // The offer: the first price and promo code.
  const price = PRICE.exec(full);
  if (price) {
    const r = { start: price.index, end: price.index + price[0].length };
    const st = statusOf(r);
    items.push({ kind: "price", label: "Price", quote: price[0], status: st, at: pos(r.start) });
    if (st !== "seen") warnings.push({ tone: "note", text: `The price ${price[0]} is ${after}.` });
  }
  const code = CODE.exec(full);
  if (code) {
    const s = code.index + code[0].length - code[1].length;
    const st = statusOf({ start: s, end: s + code[1].length });
    items.push({ kind: "code", label: "Promo code", quote: code[1], status: st, at: pos(s) });
    if (st !== "seen") warnings.push({ tone: "note", text: `The promo code ${code[1]} is ${after}.` });
  }

  items.sort((a, b) => (a.at ?? 1e9) - (b.at ?? 1e9));
  return { channel: input.channel, spec, subject, subjectFrom, body, visible, hidden, cut, shown: countGraphemes(visible), total: countGraphemes(body), items, warnings };
}

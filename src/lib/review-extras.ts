/**
 * Pure helpers for the review screen: keyboard review, undoing an accepted fix, and precedents from the team's
 * own history. No database or browser access here, so the server, the page and the unit tests share them.
 */

// ---------- Keyboard review ----------

export type KeyAction = "next" | "prev" | "toggle" | "accept" | "dismiss" | "undo" | "help" | "close";

export interface KeyInput {
  key: string;
  ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean;
  /** The tag name of the element the key was pressed in (INPUT, TEXTAREA, BUTTON…). */
  tag?: string;
  /** The element is contentEditable. */
  editable?: boolean;
  /** The element is a button, link, summary or other control that handles Enter and Space itself. */
  interactive?: boolean;
  /** Focus is inside the findings list (arrow keys only move between findings there, so they still scroll the page elsewhere). */
  inList?: boolean;
  /** The shortcuts help dialog is open. */
  dialogOpen?: boolean;
}

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** What a key press means on the review screen, or null to leave it to the browser. */
export function reviewKey(e: KeyInput): KeyAction | null {
  if (e.ctrl || e.meta || e.alt) return null;
  if (e.tag && TYPING.has(e.tag.toUpperCase())) return null;
  if (e.editable) return null;
  if (e.dialogOpen) return e.key === "?" || e.key === "Escape" ? "close" : null;
  if (e.key === "?") return "help";
  if (e.key === "Escape") return "close";
  // Shift is a modifier too (Shift+J is not J); "?" above is the only shifted key used.
  if (e.shift) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  switch (k) {
    case "j": return "next";
    case "k": return "prev";
    case "ArrowDown": return e.inList ? "next" : null;
    case "ArrowUp": return e.inList ? "prev" : null;
    // A focused button already opens and closes its finding on Enter and Space; only take them elsewhere.
    case "Enter": case " ": return e.interactive ? null : "toggle";
    case "a": return "accept";
    case "d": return "dismiss";
    case "u": return "undo";
    default: return null;
  }
}

/** The next or previous finding in the list. Nothing focused yet: J starts at the first, K at the last. Stops at the ends. */
export function moveCursor(ids: string[], current: string | null | undefined, dir: 1 | -1): string | null {
  if (!ids.length) return null;
  const i = current ? ids.indexOf(current) : -1;
  if (i < 0) return dir === 1 ? ids[0] : ids[ids.length - 1];
  return ids[Math.max(0, Math.min(ids.length - 1, i + dir))];
}

interface FixableFinding { state?: string; fix?: string | null; location?: string | null }

/** A fix can be accepted from the keyboard where the "Accept fix" button would be offered: an open text finding with a fix, on a draft the creator can still change. */
export function canAcceptFix(f: FixableFinding | null | undefined, canEdit: boolean): boolean {
  return !!f && canEdit && f.state === "open" && f.fix !== null && f.fix !== undefined && (f.location ?? "text") === "text";
}

/** Why A did nothing, in words for the screen-reader announcement. */
export function whyNoAccept(f: FixableFinding | null | undefined, canEdit: boolean): string {
  if (!f) return "Move to a finding first with J or K.";
  if (!canEdit) return "Fixes can't be accepted while the draft is with a reviewer or approved.";
  if (f.fix === null || f.fix === undefined) return "No fix is offered for this finding. Edit the text or dismiss it.";
  if ((f.location ?? "text") !== "text") return "Image findings are fixed in the design file.";
  return "This finding is not open.";
}

// ---------- Undo an accepted fix ----------

export interface UndoFinding { id: string; rule_id: string; quote: string; state: string; draft_version?: number; location?: string | null }
export interface UndoEvent { action: string; detail: Record<string, unknown>; at: string }
export interface UndoInput {
  text: string;
  findings: UndoFinding[];
  /** This draft's events, newest first. */
  events: UndoEvent[];
  versions: { version: number; text: string }[];
  finding_id?: string;
  /** Undo every fix saved in this version at once (an "Accept all"). */
  version?: number;
}
export type UndoPlan =
  | { ok: true; version: number; restore: string; restoredVersion: number; reopen: string[]; remove: string[]; fixes: { rule: string; from: string; to: string }[] }
  | { ok: false; status: number; error: string };

/**
 * Work out what undoing an accepted fix means: which version it made, the text before it, the findings to reopen,
 * and the findings raised and settled inside that step (they never existed before it, so they are removed).
 * Every fix saved in the same version is undone together, so an "Accept all" is undone as one step.
 * Refused (409) when the text has changed since: the current text must still be the accepted version's text.
 */
export function planUndo(input: UndoInput): UndoPlan {
  const accepted = input.events.filter((e) => e.action === "fix_accepted");
  let version: number;
  if (input.finding_id) {
    const f = input.findings.find((x) => x.id === input.finding_id);
    if (!f) return { ok: false, status: 400, error: "That finding was not found on this draft." };
    if (f.state !== "accepted") return { ok: false, status: 409, error: "That finding's fix is not accepted, so there is nothing to undo." };
    const ev = accepted.find((e) => e.detail.rule === f.rule_id && e.detail.from === f.quote);
    if (!ev) return { ok: false, status: 409, error: "No accepted fix is recorded for that finding, so it can't be undone." };
    version = Number(ev.detail.version);
  } else if (input.version !== undefined && input.version !== null) {
    version = Number(input.version);
    if (!Number.isInteger(version) || !accepted.some((e) => Number(e.detail.version) === version)) {
      return { ok: false, status: 409, error: "No fixes were accepted in that version, so there is nothing to undo." };
    }
  } else {
    return { ok: false, status: 400, error: "Say which fix to undo (finding_id) or which version (version)." };
  }
  const made = input.versions.find((v) => v.version === version);
  const before = input.versions.find((v) => v.version === version - 1);
  if (!made || !before) return { ok: false, status: 409, error: "The version before this fix is not recorded, so it can't be restored." };
  if (input.text !== made.text) {
    return { ok: false, status: 409, error: "The text has changed since this fix was accepted, so it can't be undone. Edit the text instead." };
  }
  const fixes = accepted.filter((e) => Number(e.detail.version) === version)
    .map((e) => ({ rule: String(e.detail.rule), from: String(e.detail.from), to: String(e.detail.to ?? "") }));
  const inStep = input.findings.filter((f) => f.state === "accepted" && fixes.some((x) => x.rule === f.rule_id && x.from === f.quote));
  // Raised by the accepted text itself and not in the restored text: they belong to the step being undone.
  const bornHere = (f: UndoFinding) => f.draft_version === version && (f.location ?? "text") === "text" && !before.text.includes(f.quote);
  const remove = input.findings.filter((f) => bornHere(f) && (f.state === "open" || inStep.includes(f))).map((f) => f.id);
  const reopen = inStep.filter((f) => !remove.includes(f.id)).map((f) => f.id);
  return { ok: true, version, restore: before.text, restoredVersion: version - 1, reopen, remove, fixes };
}

// ---------- Precedents from the team's own history ----------

export interface PrecedentRow { rule_id: string; state: string; dismiss_reason?: string | null; resolved_by?: string | null; draft_id: string; quote: string; created_at?: string | null }
export interface DismissEvent { draft_id: string | null; detail: Record<string, unknown>; at: string }
export interface Precedent { fixed: number; dismissed: number; last?: { reason: string; by: string | null; at: string | null } }

/**
 * For each rule, how often it was fixed (accepted, or closed by an edit) and dismissed on the workspace's other
 * drafts, and the latest dismissal with its reason, who gave it and when (from the dismissal event; the finding's
 * creation time when no event is found). The rows should already be limited to other drafts in the workspace.
 */
export function summarisePrecedents(rows: PrecedentRow[], events: DismissEvent[] = []): Record<string, Precedent> {
  const out: Record<string, Precedent> = {};
  // The latest dismissal event per draft, rule and quote.
  const when = new Map<string, string>();
  for (const e of events) {
    const k = `${e.draft_id}|${e.detail.rule}|${e.detail.quote}`;
    const prev = when.get(k);
    if (!prev || Date.parse(e.at) > Date.parse(prev)) when.set(k, e.at);
  }
  for (const r of rows) {
    const p = (out[r.rule_id] ??= { fixed: 0, dismissed: 0 });
    if (r.state === "accepted" || r.state === "resolved") p.fixed++;
    else if (r.state === "dismissed") {
      p.dismissed++;
      const at = when.get(`${r.draft_id}|${r.rule_id}|${r.quote}`) ?? r.created_at ?? null;
      const later = !p.last || (at !== null && (p.last.at === null || Date.parse(at) > Date.parse(p.last.at)));
      if (later) p.last = { reason: r.dismiss_reason?.trim() || "No reason recorded", by: r.resolved_by ?? null, at };
    }
  }
  for (const k of Object.keys(out)) if (!out[k].fixed && !out[k].dismissed) delete out[k];
  return out;
}

/** "today", "yesterday", "3 days ago". */
export function ago(at: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(at)) / 864e5);
  if (!Number.isFinite(days) || days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

const times = (n: number) => (n === 1 ? "once" : `${n} times`);

/** "Previously: this rule was fixed 4 times, dismissed 2 times (last: 'Approved exception' by Kavya, 3 days ago)", or null when there is no history. */
export function precedentLine(p: Precedent | null | undefined, now = Date.now()): string | null {
  if (!p || (!p.fixed && !p.dismissed)) return null;
  const parts = [p.fixed ? `fixed ${times(p.fixed)}` : "", p.dismissed ? `dismissed ${times(p.dismissed)}` : ""].filter(Boolean);
  const last = p.dismissed && p.last
    ? ` (last: '${p.last.reason}'${p.last.by ? ` by ${p.last.by}` : ""}${p.last.at ? `, ${ago(p.last.at, now)}` : ""})`
    : "";
  return `Previously: this rule was ${parts.join(", ")}${last}`;
}

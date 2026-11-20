// Pure helpers for the review page's live parts: words selected in the draft for "Make this a rule", and what changed
// when the page polls the draft while someone else works on it. No browser or server objects, so they are unit tested.
import { sentenceAt } from "./engine/code";

export const MIN_SELECTION = 3;
export const MAX_SELECTION = 120;
/** The reviewers and the brand manager: they see the floating "Make this a rule" button, and make and revoke join links. */
export const REVIEWER_ROLES = ["brand", "compliance", "manager"];

/**
 * The words to propose a rule from, or null: whitespace collapsed and trimmed, 3 to 120 characters, and selected
 * inside the draft text. The sentence is the one the words sit in, when they are found in the draft as written.
 */
export function selectionForRule(raw: string | null | undefined, draftText: string, inside: boolean): { text: string; sentence?: string } | null {
  if (!inside || !raw) return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length < MIN_SELECTION || text.length > MAX_SELECTION) return null;
  const at = draftText.indexOf(text);
  const sentence = at >= 0 ? sentenceAt(draftText, at).text.trim() : "";
  return sentence ? { text, sentence } : { text };
}

/** Where the floating button goes: just under the selection, kept inside the window. */
export function floatAt(rect: { left: number; bottom: number; top: number }, view: { w: number; h: number }, size = { w: 150, h: 34 }): { left: number; top: number } {
  const left = Math.max(8, Math.min(rect.left, view.w - size.w - 8));
  const below = rect.bottom + 6;
  const top = below + size.h > view.h - 8 ? Math.max(8, rect.top - size.h - 6) : below;
  return { left: Math.round(left), top: Math.round(top) };
}

/** What the poll compares: the draft's version and status, and how many findings are open. */
export interface LiveSnap { version: number; status: string; open: number }
export function snapOf(d: { draft: { version: number; status: string }; findings: { state?: string }[] }): LiveSnap {
  return { version: d.draft.version, status: d.draft.status, open: d.findings.filter((f) => f.state === "open").length };
}

/** The newest event, in words for the "Updated:" notice. */
const LIVE: Record<string, string> = {
  approved: "approved this draft", approved_partial: "gave the compliance sign-off", changes_requested: "requested changes",
  submitted: "submitted this draft", text_edited: "edited the text", fix_accepted: "accepted a fix", fix_undone: "undid a fix",
  finding_dismissed: "dismissed a finding", finding_reopened: "reopened a finding", images_updated: "updated the images",
  assets_updated: "updated the documents", review_run: "ran the review again", reapproval_needed: "sent it back for re-approval",
  exception_lapsed: "reopened a lapsed exception", comment: "commented",
};

/**
 * The polite notice for a change someone else made, or null when the version, status and open-findings count are all
 * the same. Names the newest event's actor and action when it is one people would recognise.
 */
export function liveChange(prev: LiveSnap, next: LiveSnap, newest?: { actor: string; action: string } | null): string | null {
  if (prev.version === next.version && prev.status === next.status && prev.open === next.open) return null;
  const what = newest ? LIVE[newest.action] : undefined;
  if (what) return `Updated: ${newest!.actor} ${what}.`;
  const diff = Math.abs(next.open - prev.open);
  if (diff) return `Updated: ${diff} finding${diff === 1 ? "" : "s"} changed.`;
  if (prev.version !== next.version) return `Updated: this draft is now version ${next.version}.`;
  return "Updated: this draft changed.";
}

/** Whether the poll may run now: the tab is visible, nothing is being edited, no dialog is open, no request is out. */
export function mayPoll(s: { visible: boolean; approved: boolean; editing: boolean; dialog: boolean; busy: boolean }): boolean {
  return s.visible && !s.approved && !s.editing && !s.dialog && !s.busy;
}

/** Where the browser goes after joining: the draft the invite was made from, or the list of reviews. */
export function joinTarget(draftId: unknown): string {
  return typeof draftId === "string" && /^[0-9a-f-]{36}$/.test(draftId) ? `/review/${draftId}` : "/";
}

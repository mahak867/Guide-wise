// The review page's live parts: words selected for "Make this a rule", where the floating button goes, and what the
// poll reports when someone else changed the draft.
import { describe, expect, it } from "vitest";
import { floatAt, joinTarget, liveChange, mayPoll, REVIEWER_ROLES, selectionForRule, snapOf } from "../src/lib/live";

const TEXT = "Join India's #1 coaching for NEET 2027. Classes start 1 December.\nWrite to admissions@preppath.in.";

describe("selectionForRule", () => {
  it("takes 3 to 120 characters selected inside the draft, with their sentence", () => {
    expect(selectionForRule("India's #1 coaching", TEXT, true)).toEqual({ text: "India's #1 coaching", sentence: "Join India's #1 coaching for NEET 2027" });
    expect(selectionForRule("Classes start", TEXT, true)?.sentence).toBe("Classes start 1 December");
  });
  it("collapses whitespace and trims", () => {
    expect(selectionForRule("  India's   #1\n coaching ", TEXT, true)?.text).toBe("India's #1 coaching");
  });
  it("ignores a selection outside the draft, too short, too long or empty", () => {
    expect(selectionForRule("India's #1 coaching", TEXT, false)).toBeNull();
    expect(selectionForRule("ab", TEXT, true)).toBeNull();
    expect(selectionForRule("  a  ", TEXT, true)).toBeNull();
    expect(selectionForRule("x".repeat(121), TEXT, true)).toBeNull();
    expect(selectionForRule("x".repeat(120), TEXT, true)).toEqual({ text: "x".repeat(120) });
    expect(selectionForRule("", TEXT, true)).toBeNull();
    expect(selectionForRule(null, TEXT, true)).toBeNull();
  });
  it("keeps the words without a sentence when they span a line break", () => {
    expect(selectionForRule("1 December.\nWrite to", TEXT, true)).toEqual({ text: "1 December. Write to" });
  });
});

describe("floatAt", () => {
  it("sits under the selection, inside the window", () => {
    expect(floatAt({ left: 100, top: 200, bottom: 220 }, { w: 1000, h: 800 })).toEqual({ left: 100, top: 226 });
    expect(floatAt({ left: 990, top: 200, bottom: 220 }, { w: 1000, h: 800 }).left).toBe(1000 - 150 - 8);
    expect(floatAt({ left: -20, top: 200, bottom: 220 }, { w: 1000, h: 800 }).left).toBe(8);
  });
  it("goes above the selection near the bottom of the window", () => {
    expect(floatAt({ left: 100, top: 760, bottom: 780 }, { w: 1000, h: 800 }).top).toBe(760 - 34 - 6);
  });
});

describe("live updates", () => {
  const data = (version: number, status: string, states: string[]) => ({ draft: { version, status }, findings: states.map((state) => ({ state })) });
  it("counts only open findings", () => {
    expect(snapOf(data(3, "draft", ["open", "accepted", "open", "dismissed"]))).toEqual({ version: 3, status: "draft", open: 2 });
  });
  it("says nothing when nothing that matters changed", () => {
    expect(liveChange(snapOf(data(2, "draft", ["open"])), snapOf(data(2, "draft", ["open"])), { actor: "Kavya", action: "comment" })).toBeNull();
  });
  it("names the newest event's actor and action", () => {
    expect(liveChange({ version: 2, status: "compliance_review", open: 0 }, { version: 2, status: "approved", open: 0 }, { actor: "Kavya", action: "approved" })).toBe("Updated: Kavya approved this draft.");
    expect(liveChange({ version: 2, status: "draft", open: 3 }, { version: 3, status: "draft", open: 2 }, { actor: "Riya", action: "fix_accepted" })).toBe("Updated: Riya accepted a fix.");
  });
  it("counts the findings that changed when the event is not one it can name", () => {
    expect(liveChange({ version: 2, status: "draft", open: 5 }, { version: 2, status: "draft", open: 3 }, { actor: "Meera", action: "something_new" })).toBe("Updated: 2 findings changed.");
    expect(liveChange({ version: 2, status: "draft", open: 1 }, { version: 2, status: "draft", open: 2 }, null)).toBe("Updated: 1 finding changed.");
    expect(liveChange({ version: 2, status: "draft", open: 1 }, { version: 4, status: "draft", open: 1 })).toBe("Updated: this draft is now version 4.");
  });
  it("pauses while hidden, approved, editing, in a dialog or busy", () => {
    const ok = { visible: true, approved: false, editing: false, dialog: false, busy: false };
    expect(mayPoll(ok)).toBe(true);
    for (const k of ["approved", "editing", "dialog", "busy"] as const) expect(mayPoll({ ...ok, [k]: true })).toBe(false);
    expect(mayPoll({ ...ok, visible: false })).toBe(false);
  });
});

describe("join links, in the browser", () => {
  it("open the invite's draft, or the reviews", () => {
    expect(joinTarget("0b6f2c1e-8c4a-4a6e-9f57-1d2c3b4a5e6f")).toBe("/review/0b6f2c1e-8c4a-4a6e-9f57-1d2c3b4a5e6f");
    for (const v of [null, undefined, "", "../kit", "https://evil.example/", 42]) expect(joinTarget(v)).toBe("/");
  });
  it("are made by the reviewers and the brand manager, never the creator", () => {
    expect(REVIEWER_ROLES).toEqual(["brand", "compliance", "manager"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  ago, canAcceptFix, moveCursor, planUndo, precedentLine, reviewKey, summarisePrecedents, whyNoAccept,
  type UndoInput,
} from "../src/lib/review-extras";

describe("keyboard review: what each key means", () => {
  it("maps J/K, arrows in the list, Enter/Space, A, D, U, ? and Esc", () => {
    expect(reviewKey({ key: "j" })).toBe("next");
    expect(reviewKey({ key: "J" })).toBe("next"); // caps lock
    expect(reviewKey({ key: "k" })).toBe("prev");
    expect(reviewKey({ key: "ArrowDown", inList: true })).toBe("next");
    expect(reviewKey({ key: "ArrowUp", inList: true })).toBe("prev");
    expect(reviewKey({ key: "Enter", tag: "BODY" })).toBe("toggle");
    expect(reviewKey({ key: " ", tag: "DIV" })).toBe("toggle");
    expect(reviewKey({ key: "a" })).toBe("accept");
    expect(reviewKey({ key: "d" })).toBe("dismiss");
    expect(reviewKey({ key: "u" })).toBe("undo");
    expect(reviewKey({ key: "?", shift: true })).toBe("help");
    expect(reviewKey({ key: "Escape" })).toBe("close");
    expect(reviewKey({ key: "x" })).toBeNull();
  });

  it("ignores keys while typing in a box", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT", "input"]) expect(reviewKey({ key: "a", tag })).toBeNull();
    expect(reviewKey({ key: "j", tag: "DIV", editable: true })).toBeNull();
    expect(reviewKey({ key: "?", tag: "TEXTAREA", shift: true })).toBeNull();
  });

  it("ignores keys with Ctrl, Cmd, Alt or Shift held (except ? which needs Shift)", () => {
    expect(reviewKey({ key: "a", ctrl: true })).toBeNull();
    expect(reviewKey({ key: "j", meta: true })).toBeNull();
    expect(reviewKey({ key: "d", alt: true })).toBeNull();
    expect(reviewKey({ key: "J", shift: true })).toBeNull();
    expect(reviewKey({ key: "?", shift: true, ctrl: true })).toBeNull();
  });

  it("leaves arrows to scroll the page outside the list, and Enter/Space to a focused button", () => {
    expect(reviewKey({ key: "ArrowDown" })).toBeNull();
    expect(reviewKey({ key: "ArrowUp", inList: false })).toBeNull();
    expect(reviewKey({ key: "Enter", tag: "BUTTON", interactive: true })).toBeNull();
    expect(reviewKey({ key: " ", tag: "BUTTON", interactive: true, inList: true })).toBeNull();
    // J/K still work from a focused button.
    expect(reviewKey({ key: "j", tag: "BUTTON", interactive: true, inList: true })).toBe("next");
  });

  it("with the help dialog open, only ? and Esc do anything (they close it)", () => {
    expect(reviewKey({ key: "?", shift: true, dialogOpen: true })).toBe("close");
    expect(reviewKey({ key: "Escape", dialogOpen: true })).toBe("close");
    expect(reviewKey({ key: "a", dialogOpen: true })).toBeNull();
    expect(reviewKey({ key: "j", dialogOpen: true })).toBeNull();
  });

  it("moves between findings and stops at the ends", () => {
    const ids = ["a", "b", "c"];
    expect(moveCursor(ids, null, 1)).toBe("a");
    expect(moveCursor(ids, null, -1)).toBe("c");
    expect(moveCursor(ids, "a", 1)).toBe("b");
    expect(moveCursor(ids, "c", 1)).toBe("c");
    expect(moveCursor(ids, "a", -1)).toBe("a");
    expect(moveCursor(ids, "gone", 1)).toBe("a");
    expect(moveCursor([], "a", 1)).toBeNull();
  });

  it("A accepts only where the Accept fix button is offered", () => {
    const f = { state: "open", fix: "PrepPath", location: "text" };
    expect(canAcceptFix(f, true)).toBe(true);
    expect(canAcceptFix({ ...f, fix: "" }, true)).toBe(true); // a fix that removes the words
    expect(canAcceptFix(f, false)).toBe(false);
    expect(canAcceptFix({ ...f, fix: null }, true)).toBe(false);
    expect(canAcceptFix({ ...f, location: "image:1" }, true)).toBe(false);
    expect(canAcceptFix({ ...f, state: "accepted" }, true)).toBe(false);
    expect(canAcceptFix(null, true)).toBe(false);
    expect(whyNoAccept(null, true)).toMatch(/J or K/);
    expect(whyNoAccept(f, false)).toMatch(/reviewer or approved/);
    expect(whyNoAccept({ ...f, fix: null }, true)).toMatch(/No fix/);
  });
});

describe("undoing an accepted fix", () => {
  const v1 = "Join Preppath now. 100% selection guaranteed.";
  const v2 = "Join PrepPath now. 100% selection guaranteed.";
  const base: UndoInput = {
    text: v2,
    findings: [
      { id: "f1", rule_id: "R-1", quote: "Preppath", state: "accepted", draft_version: 1 },
      { id: "f2", rule_id: "R-12", quote: "100% selection guaranteed", state: "open", draft_version: 1 },
    ],
    events: [{ action: "fix_accepted", detail: { rule: "R-1", from: "Preppath", to: "PrepPath", version: 2 }, at: "2026-11-20T10:00:00Z" }],
    versions: [{ version: 1, text: v1 }, { version: 2, text: v2 }],
    finding_id: "f1",
  };

  it("restores the text before the fix and reopens the finding", () => {
    const p = planUndo(base);
    expect(p).toMatchObject({ ok: true, version: 2, restore: v1, restoredVersion: 1, reopen: ["f1"], remove: [] });
  });

  it("refuses with 409 when the text has changed since the fix was accepted", () => {
    const p = planUndo({ ...base, text: v2 + " Edited." });
    expect(p).toMatchObject({ ok: false, status: 409 });
    expect(!p.ok && p.error).toMatch(/text has changed/);
  });

  it("refuses a finding that is not accepted, or one with no recorded fix", () => {
    expect(planUndo({ ...base, finding_id: "f2" })).toMatchObject({ ok: false, status: 409 });
    expect(planUndo({ ...base, events: [] })).toMatchObject({ ok: false, status: 409 });
    expect(planUndo({ ...base, finding_id: "nope" })).toMatchObject({ ok: false, status: 400 });
    expect(planUndo({ ...base, finding_id: undefined })).toMatchObject({ ok: false, status: 400 });
    expect(planUndo({ ...base, versions: [{ version: 2, text: v2 }] })).toMatchObject({ ok: false, status: 409 });
  });

  it("undoes an Accept all as one step, removing findings raised and fixed inside it", () => {
    const t1 = "Join Preppath now!! Call 98765 43210.";
    const t2 = "Join PrepPath now! Call 1800 123 456. T&C apply.";
    const p = planUndo({
      text: t2,
      findings: [
        { id: "a", rule_id: "R-1", quote: "Preppath", state: "accepted", draft_version: 1 },
        { id: "b", rule_id: "STY", quote: "!!", state: "accepted", draft_version: 1 },
        { id: "c", rule_id: "OFFER", quote: "1800 123 456.", state: "accepted", draft_version: 2 }, // follow-up, born in the step
        { id: "d", rule_id: "R-15", quote: "98765 43210", state: "dismissed", draft_version: 1 },
      ],
      events: [
        { action: "fix_accepted", detail: { rule: "OFFER", from: "1800 123 456.", to: "1800 123 456. T&C apply.", version: 2 }, at: "2026-11-20T10:00:02Z" },
        { action: "fix_accepted", detail: { rule: "STY", from: "!!", to: "!", version: 2 }, at: "2026-11-20T10:00:01Z" },
        { action: "fix_accepted", detail: { rule: "R-1", from: "Preppath", to: "PrepPath", version: 2 }, at: "2026-11-20T10:00:00Z" },
      ],
      versions: [{ version: 1, text: t1 }, { version: 2, text: t2 }],
      version: 2,
    });
    expect(p).toMatchObject({ ok: true, restore: t1, reopen: ["a", "b"], remove: ["c"] });
    expect(p.ok && p.fixes.length).toBe(3);
  });

  it("refuses a version in which no fix was accepted", () => {
    expect(planUndo({ ...base, finding_id: undefined, version: 1 })).toMatchObject({ ok: false, status: 409 });
  });

  it("allows undoing an earlier fix once a later one has been undone (the text is back to it)", () => {
    const v3 = v2.replace("100% selection guaranteed", "Strong results");
    const p = planUndo({
      ...base,
      text: v2, // v4 restored v2's text
      events: [
        { action: "fix_accepted", detail: { rule: "R-12", from: "100% selection guaranteed", to: "Strong results", version: 3 }, at: "2026-11-20T10:01:00Z" },
        ...base.events,
      ],
      versions: [...base.versions, { version: 3, text: v3 }, { version: 4, text: v2 }],
    });
    expect(p).toMatchObject({ ok: true, version: 2, restore: v1 });
  });
});

describe("precedents from the team's own history", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const rows = [
    { rule_id: "R-15", state: "accepted", draft_id: "d1", quote: "98765 43210" },
    { rule_id: "R-15", state: "resolved", draft_id: "d2", quote: "98765 43210" },
    { rule_id: "R-15", state: "accepted", draft_id: "d3", quote: "91234 56789" },
    { rule_id: "R-15", state: "accepted", draft_id: "d4", quote: "98765 43210" },
    { rule_id: "R-15", state: "dismissed", draft_id: "d5", quote: "98765 43210", dismiss_reason: "The flag is wrong", resolved_by: "Riya", created_at: "2026-11-01T00:00:00Z" },
    { rule_id: "R-15", state: "dismissed", draft_id: "d6", quote: "98765 43210", dismiss_reason: "Approved exception", resolved_by: "Kavya", created_at: "2026-10-01T00:00:00Z" },
    { rule_id: "R-12", state: "dismissed", draft_id: "d1", quote: "100%", dismiss_reason: "The rule is unclear", resolved_by: "Arjun", created_at: "2026-11-19T00:00:00Z" },
    { rule_id: "R-9", state: "open", draft_id: "d1", quote: "x" },
  ];
  const events = [
    // Kavya's dismissal happened later than its finding was raised, and after Riya's.
    { draft_id: "d6", detail: { rule: "R-15", quote: "98765 43210" }, at: "2026-11-17T09:00:00Z" },
    { draft_id: "d5", detail: { rule: "R-15", quote: "98765 43210" }, at: "2026-11-10T09:00:00Z" },
  ];

  it("counts fixes and dismissals per rule and finds the latest dismissal from the events", () => {
    const p = summarisePrecedents(rows, events);
    expect(p["R-15"]).toEqual({ fixed: 4, dismissed: 2, last: { reason: "Approved exception", by: "Kavya", at: "2026-11-17T09:00:00Z" } });
    expect(p["R-12"]).toEqual({ fixed: 0, dismissed: 1, last: { reason: "The rule is unclear", by: "Arjun", at: "2026-11-19T00:00:00Z" } });
    expect(p["R-9"]).toBeUndefined(); // open findings are not history
  });

  it("says it in one line, and says nothing when there is no history", () => {
    const p = summarisePrecedents(rows, events);
    expect(precedentLine(p["R-15"], now)).toBe("Previously: this rule was fixed 4 times, dismissed 2 times (last: 'Approved exception' by Kavya, 3 days ago)");
    expect(precedentLine(p["R-12"], now)).toBe("Previously: this rule was dismissed once (last: 'The rule is unclear' by Arjun, yesterday)");
    expect(precedentLine({ fixed: 1, dismissed: 0 }, now)).toBe("Previously: this rule was fixed once");
    expect(precedentLine(undefined, now)).toBeNull();
    expect(precedentLine({ fixed: 0, dismissed: 0 }, now)).toBeNull();
  });

  it("dates relative to now", () => {
    expect(ago("2026-11-20T08:00:00Z", now)).toBe("today");
    expect(ago("2026-11-19T08:00:00Z", now)).toBe("yesterday");
    expect(ago("2026-11-10T08:00:00Z", now)).toBe("10 days ago");
    expect(ago("not a date", now)).toBe("today");
  });
});

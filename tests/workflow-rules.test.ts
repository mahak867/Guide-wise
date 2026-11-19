import { describe, expect, it } from "vitest";
import {
  approverLabel, approversOf, canGrantException, complianceSignOff, exceptionLapsed, exceptionReason, exceptionsOf, isIsoDate, isLapsed, parseException,
  type SignEvent,
} from "../src/lib/approval";
import { SEED_APPROVED_SIGNOFFS } from "../src/lib/seed";

describe("time-limited exceptions", () => {
  it("are stored in the dismiss reason in a readable form and parsed back", () => {
    expect(exceptionReason("2026-12-31")).toBe("Approved exception (until 2026-12-31)");
    expect(exceptionReason(null)).toBe("Approved exception");
    expect(parseException("Approved exception (until 2026-12-31)")).toEqual({ until: "2026-12-31" });
    expect(parseException("Approved exception")).toEqual({ until: null });
    expect(parseException("approved exception (until 2027-01-15) ")).toEqual({ until: "2027-01-15" });
    expect(parseException("The flag is wrong")).toBeNull();
    expect(parseException(null)).toBeNull();
    expect(parseException("Approved exception because I said so")).toBeNull();
  });

  it("accept only real calendar dates", () => {
    expect(isIsoDate("2026-12-31")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("31/12/2026")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate(20261231)).toBe(false);
  });

  it("are valid through their end date and lapse the day after; no end date never lapses", () => {
    const r = exceptionReason("2026-12-31");
    expect(exceptionLapsed(r, "2026-12-30")).toBe(false);
    expect(exceptionLapsed(r, "2026-12-31")).toBe(false);
    expect(exceptionLapsed(r, "2027-01-01")).toBe(true);
    expect(exceptionLapsed(exceptionReason(null), "2099-01-01")).toBe(false);
    expect(exceptionLapsed("The rule is unclear", "2099-01-01")).toBe(false);
  });

  it("reopen only a dismissed finding", () => {
    const f = { state: "dismissed", dismiss_reason: exceptionReason("2020-01-01") };
    expect(isLapsed(f, "2026-11-19")).toBe(true);
    expect(isLapsed({ ...f, state: "open" }, "2026-11-19")).toBe(false);
    expect(isLapsed({ ...f, dismiss_reason: exceptionReason("2027-01-01") }, "2026-11-19")).toBe(false);
  });

  it("can be granted by a reviewer, never by the creator", () => {
    expect(canGrantException("creator")).toBe(false);
    expect(canGrantException("brand")).toBe(true);
    expect(canGrantException("compliance")).toBe(true);
    expect(canGrantException("manager")).toBe(true);
  });

  it("are listed on the receipt, also for receipts that only kept the dismissals", () => {
    const base = { approver: "Kavya", approver_role: "compliance", at: "2026-11-19T10:00:00Z" };
    expect(exceptionsOf({ ...base, findings_summary: { dismissals: [{ rule: "R-12", reason: exceptionReason("2026-12-31"), by: "Kavya" }, { rule: "R-15", reason: "The flag is wrong", by: "Arjun" }] } }))
      .toEqual([{ rule: "R-12", until: "2026-12-31", by: "Kavya" }]);
    expect(exceptionsOf({ ...base, findings_summary: { exceptions: [{ rule: "R-12", quote: "x", until: null, by: "Kavya" }] } })).toHaveLength(1);
  });
});

describe("dual sign-off", () => {
  let n = 0;
  const ev = (action: string, role: string, actor = "x"): SignEvent => ({ id: ++n, action, role, actor, at: new Date(Date.UTC(2026, 10, 19, 0, n)).toISOString() });

  it("records the compliance sign-off from the events log", () => {
    expect(complianceSignOff([ev("submitted", "creator", "Riya")])).toBeNull();
    const s = complianceSignOff([ev("submitted", "creator", "Riya"), ev("approved_partial", "compliance", "Kavya"), ev("comment", "brand", "Arjun")]);
    expect(s?.actor).toBe("Kavya");
  });

  it("does not count a partial approval by anyone but compliance", () => {
    expect(complianceSignOff([ev("submitted", "creator"), ev("approved_partial", "brand", "Arjun")])).toBeNull();
  });

  it("drops the sign-off when the draft is resubmitted, sent back, or its findings are decided again", () => {
    for (const reset of ["submitted", "changes_requested", "reapproval_needed", "finding_dismissed", "finding_reopened", "exception_lapsed", "approved"]) {
      expect(complianceSignOff([ev("submitted", "creator"), ev("approved_partial", "compliance", "Kavya"), ev(reset, "brand")])).toBeNull();
    }
    // Dismissals before the sign-off are what compliance signed off on.
    expect(complianceSignOff([ev("submitted", "creator"), ev("finding_dismissed", "compliance"), ev("approved_partial", "compliance", "Kavya")])?.actor).toBe("Kavya");
  });

  it("reads events in the order they happened, whatever order they arrive in", () => {
    const list = [ev("submitted", "creator"), ev("approved_partial", "compliance", "Kavya")];
    expect(complianceSignOff([...list].reverse())?.actor).toBe("Kavya");
  });

  it("names both approvers on the receipt", () => {
    expect(approverLabel([{ name: "Kavya", role: "compliance" }, { name: "Arjun", role: "brand" }])).toBe("Kavya (compliance) and Arjun (brand)");
    expect(approverLabel([{ name: "Kavya", role: "compliance" }, { name: "Meera", role: "manager" }])).toBe("Kavya (compliance) and Meera (brand manager)");
    const r = { approver: "Kavya (compliance) and Arjun (brand)", approver_role: "compliance and brand", at: "t", findings_summary: { approvers: [{ name: "Kavya", role: "compliance", at: "a" }, { name: "Arjun", role: "brand", at: "b" }] } };
    expect(approversOf(r).map((a) => a.name)).toEqual(["Kavya", "Arjun"]);
    expect(approversOf({ approver: "Arjun", approver_role: "brand", at: "t", findings_summary: {} })).toEqual([{ name: "Arjun", role: "brand", at: "t" }]);
  });

  it("the seeded high-risk approved post carries compliance then brand", () => {
    expect(SEED_APPROVED_SIGNOFFS.map((s) => s.role)).toEqual(["compliance", "brand"]);
    expect(approverLabel(SEED_APPROVED_SIGNOFFS)).toBe("Kavya (compliance) and Arjun (brand)");
    expect(SEED_APPROVED_SIGNOFFS[0].hoursBefore).toBeGreaterThan(SEED_APPROVED_SIGNOFFS[1].hoursBefore);
  });
});

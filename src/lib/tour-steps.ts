"use client";
// The eight steps of "Watch it run". Each step drives the app's own controls (the same buttons, fields and API
// calls a visitor would use) in the visitor's own private workspace, then highlights what changed.
import type { TourContext, TourStep } from "./tour";

export interface StepEnv {
  /** Client-side navigation (Next.js router). */
  go: (path: string) => void;
  /** Draw the highlight ring around an element (null clears it). */
  highlight: (el: Element | null) => void;
}

const PAUSE = 3000;
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const visible = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
const ours = (el: Element) => !!el.closest("[data-tour-ui]");
const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

/** The first visible element matching the selector whose text matches, outside the tour's own UI. */
function find(selector: string, match?: string | RegExp, exact = false): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll(selector))) {
    if (ours(el) || !visible(el)) continue;
    const t = text(el);
    if (match === undefined || (typeof match === "string" ? (exact ? t === match : t.includes(match)) : match.test(t))) return el as HTMLElement;
  }
  return null;
}
const pageHas = (re: RegExp) => Array.from(document.querySelectorAll("main, [role=status], [role=alert]")).some((el) => !ours(el) && re.test(text(el)));

/** Polls until the condition returns a value, honouring Stop; throws after the timeout. */
async function until<T>(ctx: TourContext, cond: () => T | null | undefined | false, timeout = 30000, what = "the page"): Promise<T> {
  const end = Date.now() + timeout;
  for (;;) {
    ctx.check();
    const v = cond();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((ok) => setTimeout(ok, 200));
  }
}

function show(env: StepEnv, el: Element) {
  el.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
  env.highlight(el);
}
async function press(ctx: TourContext, env: StepEnv, el: HTMLElement) {
  show(env, el);
  await new Promise((ok) => setTimeout(ok, reduced() ? 0 : 400));
  ctx.check();
  el.click();
}
function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
async function go(ctx: TourContext, env: StepEnv, path: string) {
  if (location.pathname !== path) env.go(path);
  await until(ctx, () => location.pathname === path, 30000, path);
}
async function role(ctx: TourContext, r: string) {
  const sel = await until(ctx, () => document.querySelector<HTMLSelectElement>('header select[aria-label="Acting as"]'), 10000, "the role switcher");
  if (sel.value !== r) setValue(sel, r);
  await new Promise((ok) => setTimeout(ok, 700));
}
const openCount = () => {
  const h = find("h1, h2, h3", /^\d+ open findings?$/);
  return h ? parseInt(text(h)) : null;
};
const onReview = () => /^\/review\/[0-9a-f-]{36}$/.test(location.pathname);

export function tourSteps(env: StepEnv): TourStep[] {
  return [
    {
      caption: "1. A sample Instagram post is reviewed: code and AI checks read the caption and the creative.",
      async run(ctx) {
        await go(ctx, env, "/");
        const b = await until(ctx, () => find("button", "Review the sample post", true), 30000, "the sample post button");
        await press(ctx, env, b);
        await until(ctx, () => onReview() && openCount() !== null, 150000, "the review");
        ctx.say("1. Every finding quotes the exact words and the rule they break, with a fix that was re-tested.");
        show(env, find("h1, h2, h3", /open findings?$/)!);
        await ctx.wait(PAUSE);
      },
    },
    {
      caption: "2. Accepting a fix rewrites the draft and checks it again; it can be undone for 10 seconds.",
      async run(ctx) {
        const row = await until(ctx, () => find("button[aria-expanded]", "No false urgency"), 20000, "the urgency finding");
        if (row.getAttribute("aria-expanded") !== "true") await press(ctx, env, row);
        const accept = await until(ctx, () => find("button", "Accept fix", true), 10000, "Accept fix");
        await press(ctx, env, accept);
        const undo = await until(ctx, () => find("button", "Undo fix", true), 30000, "Undo fix");
        show(env, undo);
        await ctx.wait(PAUSE);
        ctx.say("2. Undo puts the original words and the finding back.");
        await press(ctx, env, undo);
        await until(ctx, () => pageHas(/Fix undone/), 30000, "the undo");
        await ctx.wait(PAUSE);
      },
    },
    {
      caption: "3. Accept all applies every tested fix; Submit routes the outcome claim to the compliance reviewer.",
      async run(ctx) {
        const all = await until(ctx, () => find("button", /^Accept all/), 20000, "Accept all");
        await press(ctx, env, all);
        await until(ctx, () => !find("button", /^(Accept all|Applying)/), 90000, "the fixes");
        const submit = await until(ctx, () => find("button", "Submit for review", true), 20000, "Submit for review");
        await press(ctx, env, submit);
        await until(ctx, () => pageHas(/Waiting for Kavya/), 30000, "the routing");
        show(env, find("main section, main div", /^Next step/i) ?? find("main", /Waiting for Kavya/)!);
        await ctx.wait(PAUSE);
      },
    },
    {
      caption: "4. Kavya (compliance) grants an exception, with a reason, for what is left, then signs off first.",
      async run(ctx) {
        await role(ctx, "compliance");
        for (let k = 0; k < 25; k++) {
          const n = openCount();
          if (!n) break;
          const dismiss = await until(ctx, () => find("button", "Dismiss", true), 15000, "Dismiss");
          await press(ctx, env, dismiss);
          const reason = await until(ctx, () => document.querySelector<HTMLSelectElement>('select[id^="r-"]'), 10000, "the reason");
          setValue(reason, "Approved exception");
          const grant = await until(ctx, () => find("button", "Grant exception", true), 10000, "Grant exception");
          await press(ctx, env, grant);
          await until(ctx, () => openCount() !== n, 30000, "the exception");
        }
        const approve = await until(ctx, () => find("button", "Approve", true), 20000, "Approve");
        await press(ctx, env, approve);
        await until(ctx, () => pageHas(/waiting for brand sign-off/i), 30000, "the first sign-off");
        ctx.say("4. High-risk content needs two sign-offs. Arjun (brand) signs off second.");
        await role(ctx, "brand");
        const second = await until(ctx, () => find("button", "Approve", true), 20000, "Approve");
        await press(ctx, env, second);
        await until(ctx, () => find("h1, h2, h3", "Approval receipt", true), 30000, "the receipt");
      },
    },
    {
      caption: "5. The approval receipt: both approvers, the Brand Kit version, every finding and a SHA-256 fingerprint.",
      async run(ctx) {
        const h = await until(ctx, () => find("h1, h2, h3", "Approval receipt", true), 10000, "the receipt");
        show(env, h.closest("section") ?? h);
        await ctx.wait(PAUSE + 1000);
      },
    },
    {
      caption: "6. A whole campaign is reviewed together: caption, creative, brochure and landing page.",
      async run(ctx) {
        await go(ctx, env, "/review/new");
        await role(ctx, "creator");
        const sample = await until(ctx, () => find("button", "Use the sample campaign", true), 30000, "the sample campaign");
        await press(ctx, env, sample);
        ctx.say("6. The creative is read in the browser first (text, colours, logo).");
        await until(ctx, () => pageHas(/Logo found \(match/), 150000, "the image reading");
        const run = await until(ctx, () => find("button", "Run review", true), 10000, "Run review");
        await press(ctx, env, run);
        await until(ctx, () => onReview() && openCount() !== null, 150000, "the campaign review");
        const row = await until(ctx, () => find("button[aria-expanded]", "The campaign says the same thing everywhere"), 20000, "the mismatch finding");
        if (row.getAttribute("aria-expanded") !== "true") await press(ctx, env, row);
        ctx.say("6. The fee and promo code differ between the documents; each source is cited.");
        show(env, row.parentElement ?? row);
        await ctx.wait(PAUSE);
      },
    },
    {
      caption: "7. A fact changes: F-3, the JEE selections figure. Every draft that used it is checked again.",
      async run(ctx) {
        await go(ctx, env, "/facts");
        await role(ctx, "manager");
        const rowF3 = await until(ctx, () => Array.from(document.querySelectorAll("tr")).find((tr) => !ours(tr) && visible(tr) && text(tr.cells[0] ?? tr) === "F-3"), 30000, "fact F-3");
        const edit = Array.from(rowF3.querySelectorAll("button")).find((b) => text(b) === "Edit");
        if (!edit) throw new Error("no Edit button on F-3");
        await press(ctx, env, edit);
        await until(ctx, () => find("h1, h2, h3", "Edit fact F-3", true), 10000, "the F-3 form");
        const input = await until(ctx, () => document.querySelector<HTMLInputElement>('input[placeholder="1150"]'), 10000, "the value field");
        const now = Number(input.value) || 4200;
        show(env, input);
        setValue(input, String(now + 100));
        await ctx.wait(1000);
        const save = await until(ctx, () => find("button", "Save F-3", true), 10000, "Save F-3");
        await press(ctx, env, save);
        const panel = await until(ctx, () => document.querySelector('section[aria-label="Impact of this change"]'), 30000, "the impact");
        ctx.say("7. The approved post that cites F-3 no longer passes, so it goes back for re-approval.");
        show(env, panel);
        await ctx.wait(PAUSE + 1000);
      },
    },
    {
      caption: "8. The Results page re-runs the accuracy evaluation live.",
      async run(ctx) {
        await go(ctx, env, "/results");
        const h = await until(ctx, () => find("h1, h2, h3", /Code checks only/), 30000, "the results");
        show(env, h);
        await ctx.wait(PAUSE);
        const brand = Array.from(document.querySelectorAll<HTMLSelectElement>("select")).find((s) => /Which brand/.test(s.closest("label")?.textContent ?? ""));
        if (!brand) throw new Error("no brand selector");
        show(env, brand);
        setValue(brand, "2");
        ctx.say("8. The same evaluation on a second brand, a fictional health insurer with its own rules, facts and drafts.");
        await ctx.wait(PAUSE);
        env.highlight(null);
      },
    },
  ];
}

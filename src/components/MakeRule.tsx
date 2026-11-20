"use client";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Field, Notice, inputCls } from "@/components/ui";
import { api, useApp } from "@/lib/client";
import type { Rule } from "@/lib/types";

/*
 * "Make this a rule": the rule Guidewise proposes for some words, its test sentences with the result of running them
 * through the rule's own check (by code), and "Add to Brand Kit as advisory". Self-contained: mount it with the selected
 * words, and the sentence they sit in when known. See POST /api/rules/propose and src/lib/make-rule.ts.
 */

interface Proposal {
  rule: Rule;
  type: "term" | "pattern";
  check: string;
  words: string[];
  replacement: string;
  covered_by: { id: string; title: string }[];
  wording: "template" | "ai" | "edited";
}
interface Run { passed: boolean; mode: string; results: { text: string; expect: string; got: string; ok: boolean }[] }
type Answer = { key: string; proposal?: Proposal; run?: Run; error?: string };

const CAN_ADD = ["manager", "brand", "compliance"];
const WHO = "the brand reviewer (Arjun), the compliance reviewer (Kavya) or the brand manager (Meera)";

export function MakeRule({ text, sentence, onDone }: { text: string; sentence?: string; onDone?: () => void }) {
  const { role, setRole, refresh } = useApp();
  const allowed = CAN_ADD.includes(role);
  const [as, setAs] = useState<"avoid" | "prefer">("avoid");
  const [replacement, setReplacement] = useState("");
  // What was last sent: the proposal is asked for again when the reviewer changes these and presses Update.
  const [asked, setAsked] = useState<{ as: "avoid" | "prefer"; replacement: string }>({ as: "avoid", replacement: "" });
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: string; run: Run } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const key = JSON.stringify({ text, sentence: sentence ?? "", ...asked });
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    api<{ proposal: Proposal; run: Run }>("/api/rules/propose", { text, sentence, ...asked })
      .then((o) => { if (live) setAnswer({ key, proposal: o.proposal, run: o.run }); })
      .catch((e) => { if (live) setAnswer({ key, error: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
    // key holds text, sentence and what was asked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, allowed]);

  // Focus moves into the dialog once, when it opens; Escape closes it. The latest onDone is read from a ref,
  // so a parent that passes a new function on each render does not pull focus back to the dialog.
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") done.current?.(); };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); before?.focus?.(); };
  }, []);

  const current = answer?.key === key ? answer : null;
  const loading = allowed && !current;
  const p = current?.proposal;
  const run = current?.run;
  const changed = as !== asked.as || replacement.trim() !== asked.replacement;

  async function add() {
    if (!p) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const out = await api<{ id: string; run: Run }>("/api/rules", {
        made_from_words: { text, sentence, ...asked, title: title ?? p.rule.title, description: description ?? p.rule.description },
      });
      setSaved(out);
      await refresh();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 sm:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) onDone?.(); }}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="make-rule-title" className="w-full max-w-2xl rounded-md border border-line bg-white p-4 text-sm shadow-lg focus:outline-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="make-rule-title">Make this a rule</h2>
            <p className="mt-0.5 text-muted">From the words <b className="text-ink">&ldquo;{text}&rdquo;</b>{sentence ? <> in &ldquo;{sentence.length > 140 ? sentence.slice(0, 140) + "…" : sentence}&rdquo;</> : null}</p>
          </div>
          <Button variant="ghost" onClick={() => onDone?.()} aria-label="Close">Close</Button>
        </div>

        {!allowed ? (
          <div className="mt-3 space-y-2">
            <Notice>Proposing and adding a rule is for {WHO}. You are acting as the content creator.</Notice>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setRole("brand")}>Act as Arjun (brand reviewer)</Button>
              <Button onClick={() => setRole("manager")}>Act as Meera (brand manager)</Button>
            </div>
          </div>
        ) : saved ? (
          <div className="mt-3 space-y-2">
            <Notice tone="ok">{saved.id} was added to the Brand Kit as advisory: it shows as a suggestion on drafts and never blocks approval. Its {saved.run.results.length} test sentences pass, so the brand manager can enforce it on the Brand Kit page.</Notice>
            <Button variant="primary" onClick={() => onDone?.()}>Done</Button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
              <legend className="sr-only">What the selected words are</legend>
              <label className="flex items-center gap-1.5"><input type="radio" name="mr-as" className="accent-[var(--color-ink)]" checked={as === "avoid"} onChange={() => setAs("avoid")} />Words to flag</label>
              <label className="flex items-center gap-1.5"><input type="radio" name="mr-as" className="accent-[var(--color-ink)]" checked={as === "prefer"} onChange={() => setAs("prefer")} />The preferred wording</label>
            </fieldset>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[14rem] flex-1">
                <Field label={as === "avoid" ? "Use instead" : "Words it replaces"} hint={as === "avoid" ? "(optional; empty means remove or reword)" : "(comma separated, required)"}>
                  <input className={inputCls} value={replacement} maxLength={240} onChange={(e) => setReplacement(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") setAsked({ as, replacement: replacement.trim() }); }}
                    placeholder={as === "avoid" ? "experienced mentors" : "teacher, tutor"} />
                </Field>
              </div>
              <Button disabled={!changed || loading} onClick={() => setAsked({ as, replacement: replacement.trim() })}>Update proposal</Button>
            </div>

            {loading && <p className="text-muted" role="status">Making the rule and running its tests…</p>}
            {current?.error && <Notice tone="error">{current.error}</Notice>}
            {p && run && (
              <>
                <div className="rounded-md border border-line p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs text-muted">{p.rule.id}</span>
                    <Badge>{p.type === "pattern" ? "Code check: pattern" : "Code check: term"}</Badge>
                    <Badge tone="major">Advisory</Badge>
                    <Badge tone={p.rule.severity}>{p.rule.severity}</Badge>
                    <Badge tone={run.passed ? "green" : "critical"}>{run.passed ? "Tests pass" : "Tests fail"}</Badge>
                  </div>
                  <p className="mt-2">{p.check}{p.type === "pattern" && <span className="text-muted"> The selection holds a number, so the rule flags the same words with any number.</span>}</p>
                  {!!p.covered_by.length && <p className="mt-1 text-xs text-major">Already flagged in some form by {p.covered_by.map((c) => `${c.id} (${c.title})`).join(", ")}. This rule adds a narrower check of its own.</p>}
                  <div className="mt-3 space-y-2">
                    <Field label="Title"><input className={inputCls} maxLength={200} value={title ?? p.rule.title} onChange={(e) => setTitle(e.target.value)} /></Field>
                    <Field label="What the rule says"><textarea rows={2} maxLength={1000} className={inputCls} value={description ?? p.rule.description} onChange={(e) => setDescription(e.target.value)} /></Field>
                    <p className="text-xs text-muted">{p.wording === "ai" ? "Title and description suggested by the AI. What the rule flags, and its tests, were made by code." : "Title and description from a template (the AI was not used). What the rule flags, and its tests, were made by code."}</p>
                  </div>
                </div>

                <table className="w-full text-left">
                  <caption className="pb-1 text-left !font-sans !text-xs font-medium uppercase !tracking-wide text-muted">Test sentences · run by the rule&apos;s own check ({run.mode})</caption>
                  <tbody>
                    {run.results.map((r, i) => (
                      <tr key={i} className="border-t border-line align-top">
                        <td className="py-1.5 pr-2">{r.text}</td>
                        <td className="w-24 py-1.5 pr-2 text-muted">should {r.expect}</td>
                        <td className="w-28 py-1.5"><Badge tone={r.ok ? "green" : "critical"}>{r.ok ? "Correct" : `Got: ${r.got}`}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {saveErr && <Notice tone="error">{saveErr}</Notice>}
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" disabled={saving || !run.passed || changed} onClick={add}>{saving ? "Adding…" : "Add to Brand Kit as advisory"}</Button>
                  <span className="text-xs text-muted">{changed ? "Press Update proposal first." : !run.passed ? "Its tests do not all pass, so it can't be added." : `Can be added by ${WHO}. Only the brand manager can enforce it.`}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

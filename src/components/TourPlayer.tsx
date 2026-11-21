"use client";
// "Watch it run": plays the scripted tour (src/lib/tour-steps.ts) over the live app, in the visitor's own workspace.
// Started by the home page's "Watch it run (2 min)" button through a window event; Stop or Esc ends it at once.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TourRunner, type TourState } from "@/lib/tour";
import { tourSteps } from "@/lib/tour-steps";

export const TOUR_START = "gw-tour-start";

export function TourPlayer() {
  const router = useRouter();
  const runner = useRef<TourRunner | null>(null);
  const [state, setState] = useState<TourState | null>(null);
  const [target, setTarget] = useState<Element | null>(null);
  const [ring, setRing] = useState<DOMRect | null>(null);

  const close = useCallback(() => { runner.current?.stop(); runner.current = null; setState(null); setTarget(null); }, []);

  const start = useCallback(() => {
    if (runner.current && (runner.current.current.status === "running" || runner.current.current.status === "paused")) return;
    const r = new TourRunner(tourSteps({ go: (p) => router.push(p), highlight: setTarget }), (s) => {
      setState(s);
      if (s.status === "stopped") { runner.current = null; setState(null); setTarget(null); }
    });
    runner.current = r;
    void r.start();
  }, [router]);

  useEffect(() => {
    window.addEventListener(TOUR_START, start);
    return () => window.removeEventListener(TOUR_START, start);
  }, [start]);

  // Esc stops the tour whenever it is on screen.
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  // The highlight ring follows its element through scrolling and resizing.
  useEffect(() => {
    if (!target) return;
    let id = 0;
    const tick = () => { setRing(target.isConnected ? target.getBoundingClientRect() : null); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [target]);

  if (!state) return null;
  const live = state.status === "running" || state.status === "paused";
  return (
    <>
      {ring && target && live && (
        <div aria-hidden className="pointer-events-none fixed z-40 rounded-md" style={{ left: ring.left - 6, top: ring.top - 6, width: ring.width + 12, height: ring.height + 12, outline: "3px solid #d97706", boxShadow: "0 0 0 9999px rgba(28,27,24,0.08)" }} />
      )}
      <div data-tour-ui role="region" aria-label="Watch it run" data-tour-status={state.status}
        className="fixed left-1/2 top-3 z-50 w-[min(760px,calc(100vw-32px))] -translate-x-1/2 rounded-lg bg-ink px-4 py-3 text-paper shadow-xl print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-paper/80">Watch it run · Step {Math.max(state.step, 1)} of {state.total}</p>
          <div className="flex gap-2">
            {live ? (
              <>
                <button type="button" className="rounded border border-paper/40 px-2.5 py-1 text-[13px] hover:bg-paper/10" onClick={() => (state.status === "paused" ? runner.current?.resume() : runner.current?.pause())}>
                  {state.status === "paused" ? "Resume" : "Pause"}
                </button>
                <button type="button" className="rounded border border-paper/40 px-2.5 py-1 text-[13px] hover:bg-paper/10" onClick={() => runner.current?.next()}>Next</button>
                <button type="button" className="rounded border border-paper/40 px-2.5 py-1 text-[13px] hover:bg-paper/10" onClick={close}>Stop</button>
              </>
            ) : (
              <button type="button" className="rounded border border-paper/40 px-2.5 py-1 text-[13px] hover:bg-paper/10" onClick={close}>Close</button>
            )}
          </div>
        </div>
        <p aria-live="polite" className="mt-1.5 text-[15px] leading-snug">
          {state.status === "done" ? "The demo finished. Everything it did is in your own workspace; carry on from here." : state.status === "failed" ? state.message : state.caption}
        </p>
      </div>
    </>
  );
}

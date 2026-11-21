// "Watch it run": a scripted tour that drives the app itself, one step at a time, with Pause, Next and Stop.
// This file holds only the runner (no DOM), so it can be unit-tested; the steps are in src/lib/tour-steps.ts.

export interface TourStep {
  /** Shown in the caption bar: what happens in this step and why. */
  caption: string;
  run: (ctx: TourContext) => Promise<void>;
}

export interface TourContext {
  /** Waits, honouring Pause (time stands still), Next (the wait ends at once) and Stop (throws TourStopped). */
  wait: (ms: number) => Promise<void>;
  /** Throws TourStopped when the tour was stopped; call between actions so a stop takes effect quickly. */
  check: () => void;
  /** Updates the caption within a step. */
  say: (text: string) => void;
}

export type TourStatus = "idle" | "running" | "paused" | "done" | "stopped" | "failed";

export interface TourState {
  status: TourStatus;
  /** 1-based step number shown to the visitor; 0 before the first step. */
  step: number;
  total: number;
  caption: string;
  /** Set when the tour failed: "The demo stopped at step N; you can continue by hand." */
  message: string | null;
}

export class TourStopped extends Error {
  constructor() { super("stopped"); }
}

export const failMessage = (step: number) => `The demo stopped at step ${step}; you can continue by hand.`;

/**
 * Runs the steps in order. Pause holds the tour at the next wait; Next ends the current wait at once;
 * Stop ends the tour at the next wait or check. A step that throws ends the tour with failMessage(step).
 */
export class TourRunner {
  private steps: TourStep[];
  private listener: (s: TourState) => void;
  private state: TourState;
  private stopped = false;
  private paused = false;
  private skip = false;
  private wake: (() => void) | null = null;

  constructor(steps: TourStep[], listener: (s: TourState) => void = () => {}) {
    this.steps = steps;
    this.listener = listener;
    this.state = { status: "idle", step: 0, total: steps.length, caption: "", message: null };
  }

  get current(): TourState { return this.state; }

  private set(patch: Partial<TourState>) {
    this.state = { ...this.state, ...patch };
    this.listener(this.state);
  }

  private poke() { const w = this.wake; this.wake = null; w?.(); }

  pause() { if (this.state.status === "running") { this.paused = true; this.set({ status: "paused" }); } }
  resume() { if (this.state.status === "paused") { this.paused = false; this.set({ status: "running" }); this.poke(); } }
  next() { if (this.state.status === "running" || this.state.status === "paused") { this.skip = true; this.paused = false; if (this.state.status === "paused") this.set({ status: "running" }); this.poke(); } }
  stop() {
    if (this.state.status === "running" || this.state.status === "paused") { this.stopped = true; this.paused = false; this.set({ status: "stopped" }); this.poke(); }
  }

  private check = () => { if (this.stopped) throw new TourStopped(); };

  private wait = async (ms: number) => {
    const end = Date.now() + ms;
    for (;;) {
      this.check();
      if (this.skip) { this.skip = false; return; }
      if (this.paused) { await new Promise<void>((ok) => { this.wake = ok; }); continue; }
      const left = end - Date.now();
      if (left <= 0) return;
      await new Promise<void>((ok) => { const t = setTimeout(ok, Math.min(left, 100)); this.wake = () => { clearTimeout(t); ok(); }; });
    }
  };

  async start(): Promise<TourState> {
    if (this.state.status === "running" || this.state.status === "paused") return this.state;
    this.stopped = false; this.paused = false; this.skip = false;
    this.set({ status: "running", step: 0, caption: "", message: null });
    const ctx: TourContext = { wait: this.wait, check: this.check, say: (caption) => { if (!this.stopped) this.set({ caption }); } };
    for (let i = 0; i < this.steps.length; i++) {
      if (this.stopped) return this.state;
      this.skip = false;
      this.set({ step: i + 1, caption: this.steps[i].caption });
      try {
        await this.steps[i].run(ctx);
      } catch (e) {
        if (e instanceof TourStopped || this.stopped) return this.state;
        this.set({ status: "failed", message: failMessage(i + 1) });
        return this.state;
      }
    }
    if (!this.stopped) this.set({ status: "done" });
    return this.state;
  }
}

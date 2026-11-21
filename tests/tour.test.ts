import { describe, expect, it } from "vitest";
import { failMessage, TourRunner, type TourState, type TourStep } from "../src/lib/tour";

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

describe("tour runner", () => {
  it("runs the steps in order and ends done", async () => {
    const seen: number[] = [];
    const steps: TourStep[] = [1, 2, 3].map((n) => ({ caption: `step ${n}`, run: async (ctx) => { seen.push(n); await ctx.wait(10); } }));
    const states: TourState[] = [];
    const r = new TourRunner(steps, (s) => states.push(s));
    const end = await r.start();
    expect(seen).toEqual([1, 2, 3]);
    expect(end.status).toBe("done");
    expect(end.step).toBe(3);
    expect(states.map((s) => s.caption)).toContain("step 2");
  });

  it("pause holds the tour at a wait; resume continues", async () => {
    const seen: number[] = [];
    const r = new TourRunner([
      { caption: "a", run: async (ctx) => { seen.push(1); await ctx.wait(100); } },
      { caption: "b", run: async () => { seen.push(2); } },
    ]);
    const done = r.start();
    await sleep(20);
    r.pause();
    expect(r.current.status).toBe("paused");
    await sleep(250);
    expect(seen).toEqual([1]);
    expect(r.current.step).toBe(1);
    r.resume();
    expect((await done).status).toBe("done");
    expect(seen).toEqual([1, 2]);
  });

  it("next ends the current wait at once", async () => {
    const r = new TourRunner([{ caption: "long", run: async (ctx) => { await ctx.wait(10000); } }]);
    const t0 = Date.now();
    const done = r.start();
    await sleep(20);
    r.next();
    expect((await done).status).toBe("done");
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("stop ends the tour and later steps never run", async () => {
    const seen: number[] = [];
    const r = new TourRunner([
      { caption: "a", run: async (ctx) => { seen.push(1); await ctx.wait(5000); } },
      { caption: "b", run: async () => { seen.push(2); } },
    ]);
    const done = r.start();
    await sleep(20);
    r.stop();
    const end = await done;
    expect(end.status).toBe("stopped");
    expect(seen).toEqual([1]);
  });

  it("stop while paused ends the tour", async () => {
    const seen: number[] = [];
    const r = new TourRunner([
      { caption: "a", run: async (ctx) => { seen.push(1); await ctx.wait(5000); } },
      { caption: "b", run: async () => { seen.push(2); } },
    ]);
    const done = r.start();
    await sleep(20);
    r.pause();
    await sleep(20);
    r.stop();
    expect((await done).status).toBe("stopped");
    expect(seen).toEqual([1]);
  });

  it("a step that throws ends the tour with the step number", async () => {
    const seen: number[] = [];
    const r = new TourRunner([
      { caption: "a", run: async () => { seen.push(1); } },
      { caption: "b", run: async () => { throw new Error("missing element"); } },
      { caption: "c", run: async () => { seen.push(3); } },
    ]);
    const end = await r.start();
    expect(end.status).toBe("failed");
    expect(end.message).toBe(failMessage(2));
    expect(end.message).toBe("The demo stopped at step 2; you can continue by hand.");
    expect(seen).toEqual([1]);
  });

  it("ctx.say updates the caption", async () => {
    const captions: string[] = [];
    const r = new TourRunner([{ caption: "first", run: async (ctx) => { ctx.say("second"); } }], (s) => captions.push(s.caption));
    await r.start();
    expect(captions).toContain("first");
    expect(captions).toContain("second");
    expect(r.current.caption).toBe("second");
  });

  it("start while running is a no-op", async () => {
    let runs = 0;
    const r = new TourRunner([{ caption: "a", run: async (ctx) => { runs++; await ctx.wait(50); } }]);
    const first = r.start();
    await sleep(5);
    const second = await r.start();
    expect(second.status).toBe("running");
    expect((await first).status).toBe("done");
    expect(runs).toBe(1);
  });
});

// Reading a live landing page: readable text out, and no way to make the server fetch a private address.
import { afterEach, describe, expect, it, vi } from "vitest";
import { BadInput } from "../src/lib/db";
import { blockedAddress, checkUrl, fetchPage, pageText, withScheme } from "../src/lib/webpage";

const PAGE = `<!doctype html><html><head><title>JEE Crash Course | PrepPath</title><style>.x{color:red}</style>
<script>window.track("view")</script></head><body>
<header><nav><a href="/">Home</a> <a href="/fees">Fees</a></nav></header>
<main><h1>JEE Crash Course</h1><p>Starts <b>12 January</b>. Fee &#8377;14,999 &amp; printed tests.</p>
<img src="hero.png" alt="Students in a PrepPath classroom"><ul><li>60 days</li><li>Code EARLY10</li></ul>
<form><button>Enrol</button></form></main>
<footer>© 2026 PrepPath · Privacy</footer></body></html>`;

describe("reading a web page", () => {
  it("keeps the main content, image alt text and entities, and drops scripts, menus, forms and footers", () => {
    const { title, text } = pageText(PAGE);
    expect(title).toBe("JEE Crash Course | PrepPath");
    expect(text).toBe("JEE Crash Course\nStarts 12 January. Fee ₹14,999 & printed tests.\nStudents in a PrepPath classroom\n60 days\nCode EARLY10");
    expect(text).not.toMatch(/track|Home|Fees|Enrol|Privacy|color/);
    expect(pageText(PAGE).hidden).toEqual([]);
  });
  it("separates text hidden from readers, including nested elements, and leaves small visible text alone", () => {
    const { text, hidden } = pageText(`<main><h1>Crash course</h1><div style="display:none">100% selection <b>guaranteed</b></div>
      <p style="color:#fff;background:#ffffff">Rank 1 assured</p><span style="font-size:0px">best coaching</span><p hidden>secret</p>
      <div><div style="opacity:0"><div>nested one</div> tail</div></div><p style="font-size:0.9em">visible small</p></main>`);
    expect(hidden).toEqual(["100% selection guaranteed", "Rank 1 assured", "best coaching", "secret", "nested one tail"]);
    expect(text).toBe("Crash course\nvisible small");
  });
  it("keeps table cells apart", () => {
    expect(pageText("<main><table><tr><td>Fee</td><td>₹14,999</td></tr></table></main>").text).toBe("Fee ₹14,999");
  });
  it("uses the body when there is no main or single article", () => {
    expect(pageText("<html><body><div>Join PrepPath</div><div>today</div></body></html>").text).toBe("Join PrepPath\ntoday");
  });
});

describe("refusing private addresses", () => {
  it("knows which addresses are not public", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])
      expect(blockedAddress(ip), ip).toBe(true);
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(blockedAddress(ip), ip).toBe(false);
  });
  it("rejects unsafe web addresses before fetching anything", async () => {
    for (const u of ["ftp://example.com/x", "http://localhost:3000/", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/",
      "http://user:pass@93.184.216.34/", "http://93.184.216.34:8080/", "not a url", "http://intranet.local/"])
      await expect(checkUrl(u), u).rejects.toThrow();
  });
});

describe("fetching", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("checks every redirect, so a public page cannot bounce the server to a private one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } })));
    await expect(fetchPage("http://93.184.216.34/")).rejects.toThrow(/not a public web page/);
  });
  it("refuses something that is not a web page, and a page that is too large", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } })));
    await expect(fetchPage("http://93.184.216.34/brochure.pdf")).rejects.toThrow(/not a web page/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("a".repeat(3 * 1024 * 1024), { headers: { "content-type": "text/html" } })));
    await expect(fetchPage("http://93.184.216.34/")).rejects.toThrow(/larger than 2 MB/);
  });
  it("returns the readable text of a public page after a safe redirect", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "/course" } }))
      .mockResolvedValueOnce(new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } }));
    vi.stubGlobal("fetch", f);
    const out = await fetchPage("http://93.184.216.34/");
    expect(out.url).toBe("http://93.184.216.34/course");
    expect(out.text).toMatch(/Fee ₹14,999/);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

// Bug hunt, 20 Nov 2026.
describe("reader edge cases", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("a page that stops sending half-way is a clear 400, not a server error", async () => {
    const body = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode("<p>Half a page")); },
      pull() { throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }); },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { headers: { "content-type": "text/html" } })));
    const err = await fetchPage("http://93.184.216.34/").catch((e) => e);
    expect(err).toBeInstanceOf(BadInput);
    expect(err.message).toMatch(/took too long/);
  });
  it("uses one deadline for every redirect, not a fresh one per hop", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: unknown, init: RequestInit) => {
      signals.push(init.signal!);
      return signals.length < 3
        ? new Response(null, { status: 302, headers: { location: `/hop${signals.length}` } })
        : new Response("<p>Arrived after two redirects</p>", { headers: { "content-type": "text/html" } });
    }));
    await fetchPage("http://93.184.216.34/");
    expect(signals).toHaveLength(3);
    expect(new Set(signals).size).toBe(1);
  });
  it("reads a page in the charset its server names", async () => {
    const latin1 = Buffer.from("<p>Caf\xe9 fees: \xa314,999 per term</p>", "latin1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(latin1, { headers: { "content-type": "text/html; charset=windows-1252" } })));
    expect((await fetchPage("http://93.184.216.34/")).text).toMatch(/Café fees: £14,999/);
  });
  it("adds https:// to an address typed without it, and leaves anything else alone", () => {
    expect(withScheme("example.com")).toBe("https://example.com");
    expect(withScheme(" preppath.in/course?x=1 ")).toBe("https://preppath.in/course?x=1");
    expect(withScheme("http://example.com")).toBe("http://example.com");
    expect(withScheme("javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(withScheme("not a url")).toBe("not a url");
  });
});

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { BadInput } from "./db";

/**
 * A web page in, its readable text out: the page's <main> (or its only <article>, or the body), without scripts,
 * styles, menus, headers, footers or forms. Used to review a live landing page as a campaign document.
 */
export function pageText(html: string): { title: string; text: string } {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim());
  let h = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of ["script", "style", "noscript", "svg", "template", "iframe", "head"]) h = h.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), " ");
  const main = h.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1];
  const articles = [...h.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)];
  let body = main ?? (articles.length === 1 ? articles[0][1] : h.match(/<body\b[^>]*>([\s\S]*)<\/body\s*>/i)?.[1] ?? h);
  for (const tag of ["nav", "header", "footer", "aside", "form", "button", "select"]) body = body.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), " ");
  // Image alt text is part of what a reader sees on the page.
  body = body.replace(/<img\b[^>]*\balt\s*=\s*(["'])(.*?)\1[^>]*>/gi, " $2 ");
  body = body.replace(/<(br|hr)\b[^>]*>/gi, "\n").replace(/<\/?(p|div|section|li|ul|ol|h[1-6]|tr|table|blockquote|figure|figcaption|dd|dt)\b[^>]*>/gi, "\n");
  // Table cells and labels are separated by a space; inline tags (b, span, a) vanish without one.
  const text = decode(body.replace(/<\/?(td|th|label|option)\b[^>]*>/gi, " ").replace(/<[^>]+>/g, ""))
    .split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean).join("\n");
  return { title, text };
}

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", hellip: "…", rupee: "₹", copy: "©", reg: "®", trade: "™", bull: "•", middot: "·",
};
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** True for addresses a server must never be asked to fetch: loopback, private, link-local, metadata, multicast. */
export function blockedAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return blockedAddress(mapped);
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6) || v6.startsWith("64:ff9b:") || v6.startsWith("2001:db8");
}

/** Check a URL before fetching it: public http(s) only, default ports, no credentials, every resolved address public. */
export async function checkUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new BadInput("That is not a web address. Paste the full address, starting with https://"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new BadInput("Only http and https web pages can be read.");
  if (u.username || u.password) throw new BadInput("Web addresses with a user name or password are not accepted.");
  if (u.port && u.port !== "80" && u.port !== "443") throw new BadInput("Only web pages on the standard ports can be read.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new BadInput("That address is not a public web page.");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => { throw new BadInput("That web site could not be found. Check the address."); })).map((a) => a.address);
  if (!addrs.length || addrs.some(blockedAddress)) throw new BadInput("That address is not a public web page.");
  return u;
}

const MAX_BYTES = 2 * 1024 * 1024;

/** Fetch a public web page safely (redirects re-checked, 8 s, 2 MB) and return its readable text. */
export async function fetchPage(raw: string): Promise<{ url: string; title: string; text: string }> {
  let url = await checkUrl(raw);
  for (let hop = 0; ; hop++) {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "user-agent": "Guidewise page reader", accept: "text/html,text/plain;q=0.9" } })
      .catch((e: Error) => { throw new BadInput(e.name === "TimeoutError" ? "That page took too long to answer." : "That page could not be reached."); });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= 3) throw new BadInput("That page redirects too many times.");
      url = await checkUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) throw new BadInput(`That page answered with an error (${res.status}).`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) throw new BadInput("That address is not a web page. For a PDF, download it and upload the file.");
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); throw new BadInput("That page is larger than 2 MB."); }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    const out = /text\/plain/i.test(type) ? { title: "", text: body.trim() } : pageText(body);
    return { url: url.toString(), ...out };
  }
}

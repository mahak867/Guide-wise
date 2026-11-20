import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { BadInput } from "./db";

/**
 * A web page in, its readable text out: the page's <main> (or its only <article>, or the body), without scripts,
 * styles, menus, headers, footers or forms. Used to review a live landing page as a campaign document.
 */
const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:\.0+)?(?:px|pt|em|rem|%)?\s*(?:;|$|!)|opacity\s*:\s*0(?:\.0+)?\s*(?:;|$|!)/i;

/** Same colour for text and background in an inline style, as in white-on-white text. */
function sameColours(style: string): boolean {
  const c = style.match(/(?:^|;)\s*color\s*:\s*([^;!]+)/i)?.[1]?.trim().toLowerCase();
  const bg = style.match(/background(?:-color)?\s*:\s*([^;!]+)/i)?.[1]?.trim().toLowerCase();
  const norm = (x: string) => ({ "#fff": "#ffffff", white: "#ffffff", "#000": "#000000", black: "#000000" } as Record<string, string>)[x] ?? x;
  return !!c && !!bg && norm(c) === norm(bg);
}

/**
 * Text a page hides from readers but not from search engines or AI tools: display:none, visibility:hidden, zero-size
 * or transparent type, the hidden attribute, or text the same colour as its background. Removed from the visible text
 * and returned separately so it can be shown, and checked, as hidden.
 */
function takeHidden(h: string): { html: string; hidden: string[] } {
  const hidden: string[] = [];
  const open = /<([a-z][a-z0-9]*)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = open.exec(h))) {
    const [tag, attrs] = [m[1].toLowerCase(), m[2]];
    if (/\/\s*$/.test(attrs) || /^(img|br|hr|input|meta|link|source)$/.test(tag)) continue;
    const style = attrs.match(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] ?? "";
    if (!(/\shidden(?:\s|=|$)/i.test(attrs) || HIDDEN_STYLE.test(style) || sameColours(style))) continue;
    // Find the matching close tag, counting nested elements of the same name.
    const scan = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
    scan.lastIndex = open.lastIndex;
    let depth = 1, end = h.length, s2: RegExpExecArray | null;
    while (depth && (s2 = scan.exec(h))) { depth += s2[1] ? -1 : 1; if (!depth) end = s2.index + s2[0].length; }
    const inner = h.slice(open.lastIndex, depth ? h.length : end - `</${tag}>`.length);
    const t = decode(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (t) hidden.push(t);
    h = h.slice(0, m.index) + " " + h.slice(end);
    open.lastIndex = m.index + 1;
  }
  return { html: h, hidden };
}

export function pageText(html: string): { title: string; text: string; hidden: string[] } {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim());
  let h = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of ["script", "style", "noscript", "svg", "template", "iframe", "head"]) h = h.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), " ");
  const taken = takeHidden(h);
  h = taken.html;
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
  return { title, text, hidden: taken.hidden };
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

/** An address typed without https:// ("example.com/course"), as people paste it from an address bar, gets https://. */
export function withScheme(raw: string): string {
  const s = raw.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || !/^[\w-]+(?:\.[\w-]+)+(?:[/?#:]|$)/.test(s) ? s : `https://${s}`;
}

/** Text in the charset the server names (windows-1252, Shift_JIS…), UTF-8 when it names none or one we do not know. */
function decodeBody(bytes: Buffer, type: string): string {
  const cs = /charset="?([\w.:-]+)/i.exec(type)?.[1];
  try { return new TextDecoder(cs || "utf-8").decode(bytes); } catch { return bytes.toString("utf8"); }
}

/**
 * Fetch a public web page safely (redirects re-checked, 2 MB) and return its readable text. One 8-second deadline covers
 * every redirect and the whole body (bug hunt, 20 Nov: each of four hops had its own 8 s, longer than the route is
 * allowed to run, and a page that stopped sending half-way surfaced as a server error).
 */
export async function fetchPage(raw: string): Promise<{ url: string; title: string; text: string; hidden: string[] }> {
  let url = await checkUrl(withScheme(raw));
  const signal = AbortSignal.timeout(8000);
  const late = (e: unknown) => new BadInput((e as Error)?.name === "TimeoutError" || signal.aborted ? "That page took too long to answer." : "That page could not be reached.");
  for (let hop = 0; ; hop++) {
    const res = await fetch(url, { redirect: "manual", signal, headers: { "user-agent": "Guidewise page reader", accept: "text/html,text/plain;q=0.9" } })
      .catch((e: Error) => { throw late(e); });
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
      const { done, value } = await reader.read().catch((e) => { throw late(e); });
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); throw new BadInput("That page is larger than 2 MB."); }
      chunks.push(value);
    }
    const body = decodeBody(Buffer.concat(chunks), type);
    const out = /text\/plain/i.test(type) ? { title: "", text: body.trim(), hidden: [] as string[] } : pageText(body);
    return { url: url.toString(), ...out };
  }
}

import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { BadInput, fail, readBody } from "@/lib/db";
import { fetchPage } from "@/lib/webpage";

export const maxDuration = 30;

// DOCX or PDF in, plain text out; or {"url": …} for a public web page. Nothing is stored.
export async function POST(req: Request) {
  try {
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const { url } = (await readBody(req)) as { url?: unknown };
      if (typeof url !== "string" || !url.trim() || url.length > 2000) return fail("Send the web page address as url.");
      const page = await fetchPage(url);
      if (page.text.length < 10) return fail("No readable text was found on that page. If it is built entirely in JavaScript, copy the text from your browser instead.");
      // Hidden text is kept, under a label, so every check runs on what search engines and AI tools still read.
      const hidden = page.hidden.slice(0, 20);
      const full = hidden.length ? `${page.text}\n\n[Hidden on the page: readers do not see this text]\n${hidden.join("\n")}` : page.text;
      const truncated = full.length > 12000;
      return Response.json({ text: full.slice(0, 12000), name: page.title || new URL(page.url).hostname, url: page.url, truncated, hidden: hidden.length });
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("No file was sent.");
    const name = file.name.toLowerCase();
    if (!name.endsWith(".docx") && !name.endsWith(".pdf")) return fail("Upload a .docx or .pdf file.");
    if (file.size > 4 * 1024 * 1024) return fail("That file is larger than 4 MB.");
    const buf = Buffer.from(await file.arrayBuffer());
    let raw: string;
    let pages: number | null = null;
    try {
      if (name.endsWith(".pdf")) {
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        const out = await extractText(pdf, { mergePages: true });
        raw = Array.isArray(out.text) ? out.text.join("\n") : out.text;
        pages = out.totalPages;
      } else {
        raw = (await mammoth.extractRawText({ buffer: buf })).value;
      }
    } catch {
      throw new BadInput(`That ${name.endsWith(".pdf") ? "PDF" : "Word document"} could not be read. It may be damaged or password-protected; open it, save a fresh copy and try again, or paste the text.`);
    }
    const text = raw.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) return fail(name.endsWith(".pdf") ? "No text was found in that PDF. If it is a scanned image, add it as an image instead so its text can be read." : "No text was found in that document.");
    if (text.length > 12000) return fail("That document has more than 12,000 characters of text. Review it a section at a time.");
    return Response.json({ text, name: file.name.replace(/\.(docx|pdf)$/i, ""), pages });
  } catch (e) {
    return fail(e, 500);
  }
}

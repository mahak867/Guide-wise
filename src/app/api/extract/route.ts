import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { fail } from "@/lib/db";

export const maxDuration = 30;

// DOCX or PDF in, plain text out. The file is read in memory and not stored.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("No file was sent.");
    const name = file.name.toLowerCase();
    if (!name.endsWith(".docx") && !name.endsWith(".pdf")) return fail("Upload a .docx or .pdf file.");
    if (file.size > 4 * 1024 * 1024) return fail("That file is larger than 4 MB.");
    const buf = Buffer.from(await file.arrayBuffer());
    let raw: string;
    let pages: number | null = null;
    if (name.endsWith(".pdf")) {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const out = await extractText(pdf, { mergePages: true });
      raw = out.text;
      pages = out.totalPages;
    } else {
      raw = (await mammoth.extractRawText({ buffer: buf })).value;
    }
    const text = raw.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) return fail(name.endsWith(".pdf") ? "No text was found in that PDF. If it is a scanned image, add it as an image instead so its text can be read." : "No text was found in that document.");
    if (text.length > 12000) return fail("That document has more than 12,000 characters of text. Review it a section at a time.");
    return Response.json({ text, name: file.name.replace(/\.(docx|pdf)$/i, ""), pages });
  } catch (e) {
    return fail(e, 500);
  }
}

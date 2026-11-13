import mammoth from "mammoth";
import { fail } from "@/lib/db";

// DOCX in, plain text out. The file is read in memory and not stored.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("No file was sent.");
    if (!file.name.toLowerCase().endsWith(".docx")) return fail("Only .docx files are supported in this version.");
    if (file.size > 4 * 1024 * 1024) return fail("That file is larger than 4 MB.");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) });
    const text = value.replace(/\n{3,}/g, "\n\n").trim();
    if (!text) return fail("No text was found in that document.");
    return Response.json({ text, name: file.name.replace(/\.docx$/i, "") });
  } catch (e) {
    return fail(e, 500);
  }
}

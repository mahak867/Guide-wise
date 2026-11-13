// Personal data is replaced with placeholders before any text leaves for an AI call.
// Placeholders keep their position so quotes can be mapped back to the original text.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;

export interface Redaction {
  placeholder: string;
  original: string;
}

export function findEmails(text: string): string[] {
  return text.match(EMAIL) ?? [];
}
export function findPhones(text: string): string[] {
  return text.match(PHONE) ?? [];
}

export function redact(text: string): { text: string; map: Redaction[] } {
  const map: Redaction[] = [];
  let out = text.replace(EMAIL, (m) => {
    const p = `[EMAIL_${map.length + 1}]`;
    map.push({ placeholder: p, original: m });
    return p;
  });
  out = out.replace(PHONE, (m) => {
    const p = `[PHONE_${map.length + 1}]`;
    map.push({ placeholder: p, original: m });
    return p;
  });
  return { text: out, map };
}

export function restore(text: string, map: Redaction[]): string {
  let out = text;
  for (const r of map) out = out.split(r.placeholder).join(r.original);
  return out;
}

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

// Card numbers (13-19 digits passing the Luhn check), Aadhaar (12 digits) and PAN (ABCDE1234F).
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
const AADHAAR = /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;

function luhn(num: string): boolean {
  const d = num.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

export function redact(text: string): { text: string; map: Redaction[] } {
  const map: Redaction[] = [];
  const sub = (kind: string) => (m: string) => {
    const p = `[${kind}_${map.length + 1}]`;
    map.push({ placeholder: p, original: m });
    return p;
  };
  let out = text.replace(CARD, (m) => (luhn(m) ? sub("CARD")(m) : m));
  out = out.replace(AADHAAR, sub("ID"));
  out = out.replace(PAN, sub("ID"));
  out = out.replace(EMAIL, (m) => {
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

// A small CSV reader and writer for the bulk check. It runs in the browser, so a content calendar
// never has to be uploaded as a file: only the post texts are sent, as JSON.
// Reads RFC 4180 CSV as spreadsheets export it: quoted fields may hold commas, line breaks and
// doubled quotes (""), lines may end in CRLF or LF, and a UTF-8 byte-order mark is ignored.
// A file saved with semicolons or tabs between columns (some spreadsheet locales do this) is read too.

export class CsvError extends Error {}

/** The column separator, chosen from the first line: the most frequent of comma, semicolon and tab outside quotes. */
export function detectDelimiter(input: string): string {
  let quoted = false;
  const n: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (const c of input) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === "\n" || c === "\r")) break;
    else if (!quoted && c in n) n[c]++;
  }
  return n[";"] > n[","] && n[";"] >= n["\t"] ? ";" : n["\t"] > n[","] ? "\t" : ",";
}

/** Rows of fields. Throws a CsvError, naming the line, if a quoted field is never closed. */
export function parseCsv(input: string, delimiter = detectDelimiter(input.replace(/^﻿/, ""))): string[][] {
  const s = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let quoteLine = 0;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      if (c === "\n") line++;
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { quoted = true; quoteLine = line; i++; continue; }
    if (c === delimiter) { row.push(field); field = ""; i++; continue; }
    if (c === "\r" || c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
      i += c === "\r" && s[i + 1] === "\n" ? 2 : 1;
      line++;
      continue;
    }
    field += c; i++;
  }
  if (quoted) throw new CsvError(`A quoted field that starts on line ${quoteLine} is never closed. Check for a missing " in that row.`);
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** One CSV field: quoted when needed, and guarded so a spreadsheet never runs it as a formula. */
export function csvField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  const safe = /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

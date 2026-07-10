// Import-file parsing (US-D5, decision 4 Jul 2026): a strict in-repo CSV
// parser (RFC 4180 quoting, delimiter DECLARED in the configuration — never
// sniffed) and declared-separator numeric validation. Excel files are read in
// lib/batches/mock.ts via exceljs, which only extracts raw cell TEXT — this
// module stays the single judge of every value (ADR-4: reject, never guess).

export type ParsedTable = {
  header: string[];
  rows: string[][];
  /** PHYSICAL row per data row (1-based, header and blank rows counted), so
   * previews, resolutions and the frozen import event point at the row the
   * user sees when opening the original file (pass-3 review fix). */
  rowNumbers: number[];
};

const DELIMITERS = { comma: ",", semicolon: ";", tab: "\t" } as const;
export type CsvDelimiter = keyof typeof DELIMITERS;
export type DeclaredSeparator = "comma" | "point";

/** The RFC 4180 scanner shared by the CSV import path and the clipboard
 * tokenizer: quoted fields may contain the delimiter, newlines and doubled
 * quotes. Returns EVERY row (blank ones included) so callers keep honest
 * physical row numbers; anything structurally broken fails loudly — an
 * instrument export is evidence, not something to repair silently. */
function scanDelimitedRows(text: string, sep: string): string[][] | { error: string } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // RFC 4180 forbids content after a field's closing quote — silently
  // appending it would repair `"1,2"3` into a plausible wrong number
  // (pass-3 review fix: fail loudly instead).
  let justClosedQuote = false;
  let i = 0;
  // Strip a UTF-8 BOM — instrument exports love them.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        justClosedQuote = true;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (justClosedQuote && ch !== sep && ch !== "\n" && ch !== "\r") {
      return { error: `Row ${rows.length + 1}: content after a closing quote — the field is malformed.` };
    }
    if (ch === '"') {
      if (field !== "") return { error: `Row ${rows.length + 1}: a quote may only open a field.` };
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === sep) {
      row.push(field);
      field = "";
      justClosedQuote = false;
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      justClosedQuote = false;
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (inQuotes) return { error: "The file ends inside a quoted field — the export looks truncated." };
  row.push(field);
  rows.push(row);
  return rows;
}

const isBlankRow = (row: string[]) => row.every((c) => c.trim() === "");

export function parseCsv(text: string, delimiter: CsvDelimiter): ParsedTable | { error: string } {
  const scanned = scanDelimitedRows(text, DELIMITERS[delimiter]);
  if ("error" in scanned) return scanned;
  // Blank rows carry no data but still count toward the physical row number
  // (pass-3 review fix — the stored event must reference file positions).
  const nonBlank: { cells: string[]; physicalRow: number }[] = [];
  scanned.forEach((cells, index) => {
    if (!isBlankRow(cells)) nonBlank.push({ cells, physicalRow: index + 1 });
  });
  if (nonBlank.length < 2) return { error: "The file has no data rows under the header." };
  const [header, ...data] = nonBlank;
  return {
    header: header.cells.map((h) => h.trim()),
    rows: data.map((r) => r.cells),
    rowNumbers: data.map((r) => r.physicalRow),
  };
}

/** Tokenize a pasted spreadsheet block (US-D4 AC 13) with the SAME strict
 * quote-aware scanner as the import path, tab-delimited — Excel/Sheets wrap
 * cells containing tabs/newlines/quotes in RFC 4180 quotes on the clipboard,
 * and a blind split would shift every later value onto the wrong sample or
 * analyte (pass-3 review fix). Interior blank lines are KEPT (they are rows
 * of the copied rectangle); only trailing blank lines (the clipboard's final
 * newline) are trimmed. */
export function parseClipboardBlock(text: string): { rows: string[][] } | { error: string } {
  const scanned = scanDelimitedRows(text, "\t");
  if ("error" in scanned) {
    return { error: `The pasted block could not be read: ${scanned.error}` };
  }
  const rows = [...scanned];
  while (rows.length > 0 && isBlankRow(rows[rows.length - 1])) rows.pop();
  if (rows.length === 0) return { error: "The pasted block contains no values." };
  return { rows };
}

export type DeclaredParse = { ok: true; canonical: string } | { ok: false; message: string };

/**
 * US-D5 AC 5: numeric parsing under the DECLARED decimal separator. The
 * declaration removes the D4 ambiguity heuristics: the declared character is
 * the decimal separator, full stop — the OTHER separator character appearing
 * at all means thousands/foreign notation and is rejected, as is a repeated
 * declared separator. Digits are kept exactly as written (full precision).
 */
export function parseDeclaredNumeric(rawInput: string, separator: DeclaredSeparator): DeclaredParse {
  const raw = rawInput.trim();
  if (!raw) return { ok: false, message: "Empty value." };
  const neg = raw.startsWith("-");
  const body = neg ? raw.slice(1) : raw;
  const declared = separator === "comma" ? "," : ".";
  const other = separator === "comma" ? "." : ",";

  if (body.includes(other)) {
    return {
      ok: false,
      message: `"${raw}" contains "${other}" but the configuration declares "${declared}" as the decimal separator — thousands separators are rejected.`,
    };
  }
  if (!/^[0-9.,]+$/.test(body)) {
    return { ok: false, message: `"${raw}" is not a number.` };
  }
  const parts = body.split(declared);
  if (parts.length > 2) {
    return { ok: false, message: `"${raw}" repeats the decimal separator — thousands notation is rejected.` };
  }
  const [intPart, decimals] = parts;
  if (parts.length === 2 && !decimals) {
    return { ok: false, message: `"${raw}" ends in a separator — the value looks incomplete.` };
  }
  if (parts.length === 1) return { ok: true, canonical: `${neg ? "-" : ""}${intPart}` };
  return { ok: true, canonical: `${neg ? "-" : ""}${intPart === "" ? "0" : intPart}.${decimals}` };
}

export type ImportCellValue =
  | { kind: "numeric"; value: string }
  | { kind: "censored"; qualifier: "<" | ">"; boundary: string };

/** A cell is numeric or censored ("<x" / ">x") — anything else is rejected
 * with a reason for manual follow-up (AC 5). */
export function parseImportCell(
  rawInput: string,
  separator: DeclaredSeparator,
): { ok: true; value: ImportCellValue } | { ok: false; message: string } {
  const raw = rawInput.trim();
  if (raw.startsWith("<") || raw.startsWith(">")) {
    const parsed = parseDeclaredNumeric(raw.slice(1), separator);
    if (!parsed.ok) return { ok: false, message: `Censored boundary: ${parsed.message}` };
    return {
      ok: true,
      value: { kind: "censored", qualifier: raw[0] as "<" | ">", boundary: parsed.canonical },
    };
  }
  const parsed = parseDeclaredNumeric(raw, separator);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  return { ok: true, value: { kind: "numeric", value: parsed.canonical } };
}

// Locale-aware numeric parsing for result entry (US-D4 AC 5 / ADR-4): accept
// only what is unambiguous, reject the rest with a clear message — NEVER
// guess. Pure and client-safe (the grid may pre-validate for UX), but the
// server-side call is the gate (invariant 4).
//
// Rules (decision 4 Jul 2026):
// - one separator, comma or point, is the decimal separator;
// - EXCEPT the classic thousands pattern — exactly 3 digits after the
//   separator with a 1–3-digit non-zero integer part ("1,234" / "12.345") —
//   which is rejected as ambiguous with a hint to disambiguate;
// - repeated or mixed separators (thousands notation) are always rejected;
// - the canonical form keeps the digits EXACTLY as entered (full precision,
//   "0.010" stays "0.010"), only the separator is normalised to a point.

export type ParsedNumber = { ok: true; canonical: string } | { ok: false; message: string };

export function parseNumericInput(rawInput: string): ParsedNumber {
  const raw = rawInput.trim();
  if (!raw) return { ok: false, message: "Enter a value." };

  const neg = raw.startsWith("-");
  const body = neg ? raw.slice(1) : raw;
  if (!/^[0-9.,]+$/.test(body)) {
    return { ok: false, message: `"${raw}" is not a number — digits with one decimal separator only.` };
  }

  const separators = body.match(/[.,]/g) ?? [];
  if (separators.length > 1) {
    return {
      ok: false,
      message: `"${raw}" uses thousands notation — enter the plain number (e.g. 1234567.8).`,
    };
  }

  if (separators.length === 0) {
    return { ok: true, canonical: `${neg ? "-" : ""}${body}` };
  }

  const sep = separators[0] as string; // length === 1 checked above
  const [intPart, decimals] = body.split(sep);
  if (!decimals) return { ok: false, message: `"${raw}" ends in a separator — complete the number.` };
  const normalizedInt = intPart === "" ? "0" : intPart;

  // The ambiguity rule: "1,234" might be one-point-two-three-four or twelve
  // hundred and thirty-four written with a grouping separator. A zero (or
  // absent, or 4+ digit) integer part cannot be a grouping, so it passes.
  if (
    decimals.length === 3 &&
    intPart.length >= 1 &&
    intPart.length <= 3 &&
    !/^0+$/.test(intPart)
  ) {
    return {
      ok: false,
      message: `"${raw}" is ambiguous (decimal or thousands?) — write ${intPart}${decimals} for the whole number, or add a decimal (e.g. ${intPart}${sep}${decimals}0).`,
    };
  }

  return { ok: true, canonical: `${neg ? "-" : ""}${normalizedInt}.${decimals}` };
}

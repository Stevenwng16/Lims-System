// Exact decimal comparison for the system-computed check result (US-B3 AC 5).
// Measurement values are decimal STRINGS end to end (CLAUDE.md hard rule) and
// the tolerance comparison runs on scaled BigInts — floats never appear, so
// 100.003 vs 100.000 ± 0.002 fails exactly, never "passes by epsilon".

// Point as the only separator; an ambiguous comma is rejected at validation
// (ADR-4: never guess a separator). Measured/expected values may be negative
// (e.g. a freezer temperature check); tolerances may not.
export const SIGNED_DECIMAL = /^-?\d+(\.\d+)?$/;
export const UNSIGNED_DECIMAL = /^\d+(\.\d+)?$/;

type Dec = { neg: boolean; units: bigint; scale: number };

function parseDec(s: string): Dec | null {
  const t = s.trim();
  if (!SIGNED_DECIMAL.test(t)) return null;
  const neg = t.startsWith("-");
  const [int, frac = ""] = (neg ? t.slice(1) : t).split(".");
  return { neg, units: BigInt(int + frac), scale: frac.length };
}

/** Signed value scaled to `scale` decimal places (scale ≥ d.scale). */
function toScaled(d: Dec, scale: number): bigint {
  const scaled = d.units * 10n ** BigInt(scale - d.scale);
  return d.neg ? -scaled : scaled;
}

function absBig(v: bigint): bigint {
  return v < 0n ? -v : v;
}

/**
 * |measured − expected| ≤ tolerance, exactly. For a percent tolerance the
 * comparison is |m − e| · 100 ≤ |e| · p, cross-multiplied so no division ever
 * happens. Returns null when any operand is not a valid decimal string — the
 * caller must have validated already; null is a refusal, never a guess.
 */
export function withinTolerance(
  measured: string,
  expected: string,
  tolerance: { kind: "absolute" | "percent"; value: string },
): boolean | null {
  const m = parseDec(measured);
  const e = parseDec(expected);
  const t = parseDec(tolerance.value);
  if (!m || !e || !t || t.neg) return null;

  const scale = Math.max(m.scale, e.scale);
  const diff = absBig(toScaled(m, scale) - toScaled(e, scale));
  if (tolerance.kind === "absolute") {
    // Bring both sides to the common scale max(scale, t.scale).
    const k = Math.max(scale, t.scale);
    return diff * 10n ** BigInt(k - scale) <= t.units * 10n ** BigInt(k - t.scale);
  }
  // percent, with p = t.units / 10^t.scale:
  //   |m−e| ≤ |e| · p/100  ⇔  diff · 100 · 10^t.scale ≤ |e at scale| · t.units
  return diff * 100n * 10n ** BigInt(t.scale) <= absBig(toScaled(e, scale)) * t.units;
}

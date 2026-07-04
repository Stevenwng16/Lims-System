// Minimal, dependency-free Code 128 (subset B) barcode renderer. Encodes an
// alphanumeric string (ASCII 32–126 — covers sample IDs like MET26-00001.001)
// into a scannable SVG. QR / 2D symbologies are a US-C4 "Later" item.

// The 107 Code 128 element-width patterns (index = code value). Each entry is
// the bar/space widths (in modules), alternating bar,space,… starting on a bar.
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

/** True when every character is inside the Code 128B range (ASCII 32–126). */
export function isEncodable(value: string): boolean {
  return [...value].every((ch) => {
    const c = ch.charCodeAt(0);
    return c >= 32 && c <= 126;
  });
}

/** Returns the alternating bar/space module widths (starting with a bar).
 * Callers must check isEncodable first — silently skipping characters would
 * print a barcode that encodes a DIFFERENT string than the visible ID
 * (Fable re-review finding 16 / US-C4 AC 1). */
function encode(value: string): number[] {
  const values: number[] = [];
  for (const ch of value) {
    const code = ch.charCodeAt(0) - 32;
    if (code < 0 || code > 94) continue; // unreachable when isEncodable passed
    values.push(code);
  }
  let checksum = START_B;
  values.forEach((v, i) => {
    checksum += v * (i + 1);
  });
  checksum %= 103;
  const codes = [START_B, ...values, checksum, STOP];
  return codes.flatMap((c) => PATTERNS[c].split("").map(Number));
}

export function Barcode({ value, className }: { value: string; className?: string }) {
  if (!isEncodable(value)) {
    // Never print a barcode that doesn't encode the exact ID (AC 1).
    return (
      <div className={`flex items-center justify-center border border-dashed border-red-600 text-center text-[0.7em] text-red-600 ${className ?? ""}`}>
        ID not encodable as Code 128
      </div>
    );
  }
  const widths = encode(value);
  // Explicit quiet zone: ≥10 modules of white on each side, baked into the
  // SVG so it scales with the module width on any label size (audit finding).
  const QUIET = 10;
  const total = widths.reduce((a, b) => a + b, 0) + QUIET * 2;
  const bars: React.ReactElement[] = [];
  let x = QUIET;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push(<rect key={i} x={x} y={0} width={w} height={100} />);
    x += w;
  });
  return (
    <svg
      viewBox={`0 0 ${total} 100`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label={`Barcode ${value}`}
    >
      <g fill="currentColor">{bars}</g>
    </svg>
  );
}

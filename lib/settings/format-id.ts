// Identifier template rendering (US-A7 AC 3). Pure and client-safe: the
// Settings screen uses it for the live preview; the real backend must use
// the same token semantics when issuing IDs.
//
// Tokens: {LAB} {YY} {YYYY} {MM} {SEQ:000...} and — for sample numbers —
// {JOB} (the rendered job number).

export type IdContext = {
  lab: string;
  year: number;
  month: number;
  seq: number;
  job?: string;
};

const SEQ_TOKEN = /\{SEQ:(0+)\}/;

export function hasSeqToken(template: string): boolean {
  return SEQ_TOKEN.test(template);
}

export function renderTemplate(template: string, ctx: IdContext): string {
  // Function replacements so metacharacters ($&, $', $$) in a lab code or job
  // number can never expand into the output (audit finding 21).
  return template
    .replace(/\{LAB\}/g, () => ctx.lab)
    .replace(/\{YYYY\}/g, () => String(ctx.year))
    .replace(/\{YY\}/g, () => String(ctx.year % 100).padStart(2, "0"))
    .replace(/\{MM\}/g, () => String(ctx.month).padStart(2, "0"))
    .replace(/\{JOB\}/g, () => ctx.job ?? "")
    .replace(SEQ_TOKEN, (_, zeros: string) => String(ctx.seq).padStart(zeros.length, "0"));
}

/** Example previews the way the Settings screen shows them — rendered with a
 * REAL lab code of the organisation (the viewer's active lab), never a
 * placeholder: since 13 Jul 2026 no "MAIN" lab exists to preview with. */
export function previewIds(
  formats: { jobFormat: string; sampleFormat: string; batchFormat: string },
  labCode: string,
) {
  const now = new Date();
  const ctx: IdContext = { lab: labCode, year: now.getFullYear(), month: now.getMonth() + 1, seq: 1 };
  const job = renderTemplate(formats.jobFormat, ctx);
  return {
    job,
    sample: renderTemplate(formats.sampleFormat, { ...ctx, job }),
    batch: renderTemplate(formats.batchFormat, ctx),
  };
}

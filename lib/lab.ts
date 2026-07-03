// Active-lab context (US-A3 AC 4): mock-grade cookie until labs become real
// domain data (US-A5/A6). All screens must show data of the active lab only.

export const LAB_COOKIE = "lims_lab";

export function resolveActiveLab(labs: string[], cookieValue: string | undefined): string | null {
  if (labs.length === 0) return null;
  if (cookieValue && labs.includes(cookieValue)) return cookieValue;
  return labs[0];
}

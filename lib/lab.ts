import { mockDb } from "@/lib/mock-db";

// Active-lab context (US-A3 AC 4). The cookie holds the lab ID, not its name,
// so renaming a lab never silently resets a user's context (audit finding 13),
// and only ACTIVE assigned labs are ever offered (US-A5 AC 4/6 — audit
// finding 33). Server-only (reads the store); the switcher submits via a
// server action.

export const LAB_COOKIE = "lims_lab";

export type ActiveLab = { id: string; name: string };

/** The active labs the user is assigned to, resolved from name-based
 * assignments to stable lab records within their organisation. */
export function activeLabsForUser(labNames: string[], orgId: string): ActiveLab[] {
  const out: ActiveLab[] = [];
  for (const lab of mockDb.labs.values()) {
    if (lab.orgId !== orgId || lab.status !== "active") continue;
    if (labNames.includes(lab.name)) out.push({ id: lab.id, name: lab.name });
  }
  return out;
}

export function resolveActiveLab(
  labs: ActiveLab[],
  cookieValue: string | undefined,
): ActiveLab | null {
  if (labs.length === 0) return null;
  const byCookie = cookieValue ? labs.find((l) => l.id === cookieValue) : undefined;
  return byCookie ?? labs[0];
}

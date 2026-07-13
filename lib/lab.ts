import { mockDb } from "@/lib/mock-db";
import type { OrgRole } from "@/lib/permissions";

// Active-lab context (US-A3 AC 4). The cookie holds the lab ID, not its name,
// so renaming a lab never silently resets a user's context (audit finding 13),
// and only ACTIVE assigned labs are ever offered (US-A5 AC 4/6 — audit
// finding 33). Server-only (reads the store); the switcher submits via a
// server action.
//
// Admins are ORG-WIDE (13 Jul 2026 decision): they have no lab assignments —
// the switcher offers every active lab plus "All labs" (the default), so an
// admin never has to be assigned into a lab to see or manage it. Lab-scoped
// roles keep the assignment-based switcher.

export const LAB_COOKIE = "lims_lab";

/** Cookie sentinel for the admin-only org-wide view. */
export const ALL_LABS = "all";

export type ActiveLab = { id: string; name: string };

/** The labs offered in the shell switcher: every active lab of the
 * organisation for admins (org-wide role), the user's assigned active labs
 * for lab-scoped roles. */
export function activeLabsForUser(
  labNames: string[],
  orgId: string,
  role?: OrgRole | null,
): ActiveLab[] {
  const out: ActiveLab[] = [];
  for (const lab of mockDb.labs.values()) {
    if (lab.orgId !== orgId || lab.status !== "active") continue;
    if (role === "admin" || labNames.includes(lab.name)) out.push({ id: lab.id, name: lab.name });
  }
  return out;
}

/** Resolve the active lab from the cookie. With `allowAll` (admins), null
 * means the org-wide "All labs" view — the default when no lab is picked.
 * Without it, null means the user has no active lab at all. */
export function resolveActiveLab(
  labs: ActiveLab[],
  cookieValue: string | undefined,
  allowAll = false,
): ActiveLab | null {
  if (allowAll) {
    if (!cookieValue || cookieValue === ALL_LABS) return null;
    return labs.find((l) => l.id === cookieValue) ?? null; // unknown id → All labs
  }
  if (labs.length === 0) return null;
  const byCookie = cookieValue ? labs.find((l) => l.id === cookieValue) : undefined;
  return byCookie ?? labs[0];
}

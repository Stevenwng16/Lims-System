import type { SessionUser } from "./auth/types";
import type { SupportSession } from "./platform/support-session";

// US-A4: the capability matrix — single source of truth (AC 2). The UI renders
// from it (menu visibility, the reference page under Admin); the real backend
// must enforce the same matrix server-side on every protected action.

export type OrgRole = "admin" | "lab-manager" | "analyst" | "read-only";

export type Capability =
  | "view-data"
  | "create-jobs"
  | "create-batches"
  | "enter-data"
  | "review-approve"
  | "manage-methods-equipment-qc"
  | "assign-clearances"
  | "manage-users"
  | "org-settings";

// Notes rendered on the reference page (they are part of the matrix, AC 3/5/6):
//  * Analyst enter-data: only for methods the user is cleared for.
//  † Analyst create-batches: per-lab setting (default off, US-A7); cleared methods only.
export const CAPABILITY_ROWS: {
  capability: Capability;
  label: string;
  roles: Record<OrgRole, boolean | "cleared-only" | "per-lab-setting">;
}[] = [
  {
    capability: "view-data",
    label: "View data",
    roles: { admin: true, "lab-manager": true, analyst: true, "read-only": true },
  },
  {
    capability: "create-jobs",
    label: "Create jobs",
    roles: { admin: true, "lab-manager": true, analyst: false, "read-only": false },
  },
  {
    capability: "create-batches",
    label: "Create batches",
    roles: { admin: true, "lab-manager": true, analyst: "per-lab-setting", "read-only": false },
  },
  {
    capability: "enter-data",
    label: "Enter data / advance steps",
    roles: { admin: true, "lab-manager": true, analyst: "cleared-only", "read-only": false },
  },
  {
    capability: "review-approve",
    label: "Review & approve",
    roles: { admin: true, "lab-manager": true, analyst: false, "read-only": false },
  },
  {
    capability: "manage-methods-equipment-qc",
    label: "Manage methods / equipment / QC",
    roles: { admin: true, "lab-manager": true, analyst: false, "read-only": false },
  },
  {
    capability: "assign-clearances",
    label: "Assign method clearances",
    roles: { admin: true, "lab-manager": true, analyst: false, "read-only": false },
  },
  {
    capability: "manage-users",
    label: "Manage users",
    roles: { admin: true, "lab-manager": false, analyst: false, "read-only": false },
  },
  {
    capability: "org-settings",
    label: "Organisation settings",
    roles: { admin: true, "lab-manager": false, analyst: false, "read-only": false },
  },
];

export function can(role: OrgRole, capability: Capability): boolean {
  const row = CAPABILITY_ROWS.find((r) => r.capability === capability);
  if (!row) return false;
  const value = row.roles[role];
  // Conditional capabilities ("cleared-only", "per-lab-setting") resolve per
  // method/lab at the point of use; as a blanket answer they are "no" until
  // the specific condition is checked (clearances: US-A6, lab toggle: US-A7).
  return value === true;
}

export const ROLE_LABELS: Record<OrgRole | "platform-admin", string> = {
  admin: "Admin",
  "lab-manager": "Lab manager",
  analyst: "Analyst",
  "read-only": "Read-only",
  "platform-admin": "Vendor support",
};

/**
 * AC 13: vendor support sessions pass through the same matrix — read-only
 * grant = Read-only capabilities, admin grant = Admin capabilities. Returns
 * null when there is no organisation context (vendor outside a session).
 */
export function effectiveOrgRole(
  user: SessionUser,
  supportSession: SupportSession | null,
): OrgRole | null {
  if (user.role === "platform-admin") {
    if (!supportSession) return null;
    return supportSession.allowAdmin ? "admin" : "read-only";
  }
  return user.role;
}

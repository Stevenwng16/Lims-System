import type { OrgRole } from "@/lib/permissions";

// User-management operations of US-A6. Same pattern as the other lib modules:
// mock behind an interface, real backend plugs in later. Every rule enforced
// here must ALSO be enforced by the real backend (invariant 4) — the mock
// mirrors that enforcement so the UI behaves truthfully.

export type UserListItem = {
  email: string;
  name: string;
  role: OrgRole;
  labs: string[];
  clearances: string[]; // method IDs (labels resolved at render — stable across renames)
  status: "active" | "inactive";
  lastLogin: string | null;
  locked: boolean;
};

export type UserInput = {
  name: string;
  email: string;
  role: OrgRole;
  labs: string[];
  clearances: string[]; // meaningful for Analysts only (AC 2/5)
};

/** The acting user, resolved server-side from the session — never from the client.
 * Only Admin and Lab manager ever reach user management (US-A6 authorization). */
export type Actor = {
  email: string;
  role: Extract<OrgRole, "admin" | "lab-manager">;
  labs: string[];
  orgId: string;
};

export type UserActionResult = { status: "success" } | { status: "error"; message: string };

export interface UserApi {
  /** AC 1: admins see all users of the organisation; lab managers only their own lab(s). */
  listUsers(actor: Actor): Promise<UserListItem[]>;
  /** AC 2/3: creates the account and sends the set-password invitation. */
  createUser(actor: Actor, input: UserInput): Promise<UserActionResult>;
  /** AC 4/5/6/8/9/10: edit incl. status; all guard rules enforced. */
  updateUser(
    actor: Actor,
    targetEmail: string,
    input: UserInput & { status: "active" | "inactive" },
  ): Promise<UserActionResult>;
  /** AC 7: ties back to US-A1. */
  sendPasswordReset(actor: Actor, targetEmail: string): Promise<UserActionResult>;
  unlockAccount(actor: Actor, targetEmail: string): Promise<UserActionResult>;
}

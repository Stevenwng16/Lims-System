import { currentMethodVersion, DEMO_PASSWORD, mockDb, type MockUser } from "@/lib/mock-db";
import type { Actor, UserActionResult, UserApi, UserInput, UserListItem } from "./types";

/**
 * Method ids the actor may grant/revoke: active methods within their scope
 * (admins: whole organisation; lab managers: own labs). Everything outside
 * this set must survive a save untouched — US-B1 AC 12: deactivating a
 * method leaves existing clearance records intact.
 */
function grantableMethodIds(actor: Actor): Set<string> {
  const ids = new Set<string>();
  for (const method of mockDb.methods.values()) {
    if (method.orgId !== actor.orgId || method.status !== "active") continue;
    const labName = mockDb.labs.get(currentMethodVersion(method).labId)?.name ?? "";
    if (actor.role === "admin" || actor.labs.includes(labName)) ids.add(method.id);
  }
  return ids;
}

function toListItem(u: MockUser): UserListItem {
  return {
    email: u.email,
    name: u.name,
    role: u.role as UserListItem["role"],
    labs: u.labs,
    clearances: u.clearances,
    status: u.status,
    lastLogin: u.lastLogin,
    locked: u.locked,
  };
}

function orgUsers(orgId: string): MockUser[] {
  return [...mockDb.users.values()].filter((u) => u.orgId === orgId);
}

function sharesLab(a: string[], b: string[]): boolean {
  return a.some((lab) => b.includes(lab));
}

function isManager(actor: Actor): boolean {
  return actor.role === "admin" || actor.role === "lab-manager";
}

/**
 * AC 10: lab managers manage Analyst and Read-only users within their own
 * lab(s) only, and can never grant Admin or Lab manager.
 */
function labManagerViolation(actor: Actor, input: UserInput, target?: MockUser): string | null {
  if (actor.role !== "lab-manager") return null;
  if (target && !["analyst", "read-only"].includes(target.role)) {
    return "Lab managers cannot manage Admins or other Lab managers.";
  }
  if (!["analyst", "read-only"].includes(input.role)) {
    return "Lab managers can only assign the Analyst or Read-only role.";
  }
  if (input.labs.some((lab) => !actor.labs.includes(lab))) {
    return "Lab managers can only assign users to their own lab(s).";
  }
  return null;
}

function validateInput(input: UserInput): string | null {
  if (!input.name.trim()) return "Full name is required.";
  if (!input.email.includes("@")) return "Enter a valid email address.";
  if (input.labs.length === 0) return "Assign the user to at least one lab.";
  return null;
}

export const mockUserApi: UserApi = {
  async listUsers(actor): Promise<UserListItem[]> {
    if (!isManager(actor)) return [];
    let users = orgUsers(actor.orgId);
    if (actor.role === "lab-manager") {
      users = users.filter((u) => sharesLab(u.labs, actor.labs));
    }
    return users.map(toListItem);
  },

  async createUser(actor, input): Promise<UserActionResult> {
    if (!isManager(actor)) return { status: "error", message: "Not allowed." };
    const error = validateInput(input) ?? labManagerViolation(actor, input);
    if (error) return { status: "error", message: error };

    const email = input.email.trim().toLowerCase();
    // AC 11: unique across the whole platform, not just this organisation.
    if (mockDb.users.has(email)) {
      return { status: "error", message: "An account with this email address already exists." };
    }

    const org = mockDb.organisations.get(actor.orgId);
    mockDb.users.set(email, {
      email,
      name: input.name.trim(),
      organisation: org?.name ?? "",
      role: input.role,
      orgId: actor.orgId,
      labs: input.labs,
      clearances:
        input.role === "analyst"
          ? input.clearances.filter((id) => grantableMethodIds(actor).has(id))
          : [],
      status: "active",
      lastLogin: null,
      // AC 3: the admin never sets or sees a password — the invite flow does.
      // Mock: preset to the demo password so the new account is usable.
      password: DEMO_PASSWORD,
      mfaRequired: false,
      failedAttempts: 0,
      locked: false,
    });
    if (org) org.userCount += 1;
    console.log(
      `[mock users] invitation sent to ${email} to set a password and enrol MFA ` +
        `(mock: password preset to ${DEMO_PASSWORD})`,
    );
    return { status: "success" };
  },

  async updateUser(actor, targetEmail, input): Promise<UserActionResult> {
    if (!isManager(actor)) return { status: "error", message: "Not allowed." };
    const target = mockDb.users.get(targetEmail);
    if (!target || target.orgId !== actor.orgId) return { status: "error", message: "Unknown user." };

    // AC 9: no self-service on role/labs/clearances — own profile is elsewhere.
    if (actor.email === targetEmail) {
      return {
        status: "error",
        message: "You cannot change your own role, labs or clearances here.",
      };
    }

    const error = validateInput(input) ?? labManagerViolation(actor, input, target);
    if (error) return { status: "error", message: error };

    const newEmail = input.email.trim().toLowerCase();
    if (newEmail !== targetEmail && mockDb.users.has(newEmail)) {
      return { status: "error", message: "An account with this email address already exists." };
    }

    // AC 8 / US-A4 AC 10: the last active Admin can neither be demoted nor
    // deactivated.
    if (target.role === "admin" && (input.role !== "admin" || input.status === "inactive")) {
      const otherActiveAdmins = orgUsers(actor.orgId).some(
        (u) => u.email !== targetEmail && u.role === "admin" && u.status === "active",
      );
      if (!otherActiveAdmins) {
        return {
          status: "error",
          message:
            "This is the organisation's last active Admin — the role cannot be changed and the account cannot be deactivated.",
        };
      }
    }

    if (newEmail !== targetEmail) {
      mockDb.users.delete(targetEmail);
      target.email = newEmail;
      mockDb.users.set(newEmail, target);
    }
    target.name = input.name.trim();
    target.role = input.role;
    target.labs = input.labs;
    // AC 4/5: immediate effect — a revoked clearance blocks further work at
    // the moment of action. MERGE, never overwrite: the actor can only grant/
    // revoke within their own scope; clearances for deactivated or
    // out-of-scope methods are records that must survive intact (US-B1 AC 12),
    // and a role change away from Analyst leaves them dormant, not destroyed.
    const grantable = grantableMethodIds(actor);
    const granted = input.role === "analyst" ? input.clearances.filter((id) => grantable.has(id)) : [];
    const keptOutOfScope = target.clearances.filter((id) => !grantable.has(id));
    target.clearances = [...new Set([...granted, ...keptOutOfScope])];
    target.status = input.status;
    return { status: "success" };
  },

  async sendPasswordReset(actor, targetEmail): Promise<UserActionResult> {
    if (!isManager(actor)) return { status: "error", message: "Not allowed." };
    const target = mockDb.users.get(targetEmail);
    if (!target || target.orgId !== actor.orgId) return { status: "error", message: "Unknown user." };
    console.log(`[mock users] password reset sent to ${targetEmail} (triggered by ${actor.email})`);
    return { status: "success" };
  },

  async unlockAccount(actor, targetEmail): Promise<UserActionResult> {
    if (!isManager(actor)) return { status: "error", message: "Not allowed." };
    const target = mockDb.users.get(targetEmail);
    if (!target || target.orgId !== actor.orgId) return { status: "error", message: "Unknown user." };
    target.locked = false;
    target.failedAttempts = 0;
    return { status: "success" };
  },
};

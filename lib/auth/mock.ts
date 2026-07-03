import { DEMO_PASSWORD, mockDb } from "@/lib/mock-db";
import type { AuthApi, LoginResult, MfaResult, ResetResult, SessionUser } from "./types";
import type { MockUser } from "@/lib/mock-db";

// Mock auth backend on the shared in-memory store (lib/mock-db.ts).
// Demo accounts (password for all: LabDemo2026!!):
//   admin@demolab.nl    — organisation admin, plain login
//   analyst@demolab.nl  — MFA required, accepted code: 123456
//   user@oldcust.nl     — member of a suspended organisation (US-A2 AC 6)
//   vendor@lims.dev     — platform admin (US-A2 AC 3), lands on /platform
// Reset flow: the reset link is printed to the dev server console; the token
// demo-reset-token always works.

const DEMO_MFA_CODE = "123456";
const DEMO_RESET_TOKEN = "demo-reset-token";
const LOCKOUT_THRESHOLD = 5; // org-configurable in the real backend (AC 7)
const MIN_PASSWORD_LENGTH = 12; // org-configurable (AC 4)

function toSessionUser(u: MockUser): SessionUser {
  return { email: u.email, name: u.name, organisation: u.organisation, role: u.role };
}

function orgSuspended(user: MockUser): boolean {
  if (!user.orgId) return false;
  return mockDb.organisations.get(user.orgId)?.status !== "active";
}

export const mockAuthApi: AuthApi = {
  async login(email, password): Promise<LoginResult> {
    const user = mockDb.users.get(email.trim().toLowerCase());
    if (!user) return { status: "invalid" };
    if (user.locked) return { status: "locked" };
    if (user.password !== password) {
      user.failedAttempts += 1;
      if (user.failedAttempts >= LOCKOUT_THRESHOLD) user.locked = true;
      return user.locked ? { status: "locked" } : { status: "invalid" };
    }
    user.failedAttempts = 0;
    // Deactivated users can no longer log in (US-A6 AC 6) — same generic
    // message as a wrong password, nothing to probe.
    if (user.status === "inactive") return { status: "invalid" };
    // Only after successful authentication, so the message can't be used to
    // probe org status with guessed passwords (US-A2 AC 6).
    if (orgSuspended(user)) return { status: "org-suspended" };
    if (user.mfaRequired) return { status: "mfa_required", mfaToken: `mfa:${user.email}` };
    user.lastLogin = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return { status: "success", user: toSessionUser(user) };
  },

  async verifyMfa(mfaToken, code): Promise<MfaResult> {
    const email = mfaToken.startsWith("mfa:") ? mfaToken.slice(4) : "";
    const user = mockDb.users.get(email);
    if (!user || code !== DEMO_MFA_CODE) return { status: "invalid" };
    user.lastLogin = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return { status: "success", user: toSessionUser(user) };
  },

  async requestPasswordReset(email) {
    console.log(
      `[mock auth] password reset requested for ${email} — ` +
        `http://localhost:3000/reset-password?token=${DEMO_RESET_TOKEN}&email=${encodeURIComponent(email)}`,
    );
  },

  async resetPassword(token, newPassword): Promise<ResetResult> {
    if (token !== DEMO_RESET_TOKEN || newPassword.length < MIN_PASSWORD_LENGTH) {
      return { status: "invalid_token" };
    }
    for (const user of mockDb.users.values()) {
      // Mock simplification: the demo token carries no email binding, so apply
      // the unlock side-effect broadly (completing a reset restores a locked
      // account, AC 7).
      user.locked = false;
      user.failedAttempts = 0;
    }
    return { status: "success" };
  },

  async passwordPolicy() {
    return { minLength: MIN_PASSWORD_LENGTH };
  },
};

export { DEMO_PASSWORD };

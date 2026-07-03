import { DEMO_PASSWORD, getOrgSettings, mockDb } from "@/lib/mock-db";
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

// Security policy comes from the organisation's settings (US-A7 AC 2,
// enforced here per US-A1 AC 4/5/7). Platform staff fall back to defaults.
function securityPolicy(user: MockUser | undefined) {
  return getOrgSettings(user?.orgId ?? "org-demolab").security;
}

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
      if (user.failedAttempts >= securityPolicy(user).lockoutThreshold) user.locked = true;
      return user.locked ? { status: "locked" } : { status: "invalid" };
    }
    user.failedAttempts = 0;
    // Deactivated users can no longer log in (US-A6 AC 6) — same generic
    // message as a wrong password, nothing to probe.
    if (user.status === "inactive") return { status: "invalid" };
    // Only after successful authentication, so the message can't be used to
    // probe org status with guessed passwords (US-A2 AC 6).
    if (orgSuspended(user)) return { status: "org-suspended" };
    // MFA applies per user OR organisation-wide (US-A1 AC 5 / US-A7 AC 2).
    if (user.mfaRequired || (user.orgId && securityPolicy(user).requireMfa)) {
      return { status: "mfa_required", mfaToken: `mfa:${user.email}` };
    }
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
    if (token !== DEMO_RESET_TOKEN || newPassword.length < securityPolicy(undefined).minPasswordLength) {
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
    // Mock: the reset token carries no org binding, so use the demo org's
    // policy. The real backend resolves the policy from the token's account.
    return { minLength: securityPolicy(undefined).minPasswordLength };
  },
};

export { DEMO_PASSWORD };

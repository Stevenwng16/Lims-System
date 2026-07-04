import { DEMO_PASSWORD, defaultOrgSettings, getOrgSettings, mockDb } from "@/lib/mock-db";
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
const MFA_TOKEN_TTL_MS = 5 * 60 * 1000;

// Pending second-factor state (US-A1 AC 5): created ONLY after a password
// succeeds and all login gates pass, so the MFA step is a continuation of an
// authenticated attempt — never a standalone entry point. Opaque, single-use,
// time-limited token (audit finding).
type PendingMfa = { email: string; expiresAt: number };
const pendingMfa: Map<string, PendingMfa> = ((globalThis as Record<string, unknown>)
  .__limsPendingMfa ??= new Map()) as Map<string, PendingMfa>;

// Security policy comes from the organisation's settings (US-A7 AC 2, enforced
// here per US-A1 AC 4/5/7). Platform staff (no org) use fixed defaults — never
// one tenant's live, customer-editable settings (audit finding).
function securityPolicy(user: MockUser | undefined) {
  if (!user?.orgId) return defaultOrgSettings().security;
  return getOrgSettings(user.orgId).security;
}

function toSessionUser(u: MockUser): SessionUser {
  return { email: u.email, name: u.name, organisation: u.organisation, role: u.role };
}

function orgSuspended(user: MockUser): boolean {
  if (!user.orgId) return false;
  return mockDb.organisations.get(user.orgId)?.status !== "active";
}

function stampLogin(user: MockUser) {
  user.lastLogin = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function registerFailure(user: MockUser) {
  if (user.locked) return;
  user.failedAttempts += 1;
  if (user.failedAttempts >= securityPolicy(user).lockoutThreshold) user.locked = true;
}

export const mockAuthApi: AuthApi = {
  async login(email, password): Promise<LoginResult> {
    const user = mockDb.users.get(email.trim().toLowerCase());
    if (!user) return { status: "invalid" };
    // Verify the password BEFORE revealing any account state, so a prober with
    // guessed passwords can never learn whether an account exists or is locked
    // (US-A1 AC 3 — audit finding).
    if (user.password !== password) {
      registerFailure(user);
      return { status: "invalid" };
    }
    // Password is correct from here — now the caller may learn account state.
    if (user.locked) return { status: "locked" };
    // Deactivated users can no longer log in (US-A6 AC 6).
    if (user.status === "inactive") return { status: "invalid" };
    if (orgSuspended(user)) return { status: "org-suspended" };
    user.failedAttempts = 0;
    // MFA applies per user OR organisation-wide (US-A1 AC 5 / US-A7 AC 2).
    if (user.mfaRequired || (user.orgId && securityPolicy(user).requireMfa)) {
      const token = crypto.randomUUID();
      pendingMfa.set(token, { email: user.email, expiresAt: Date.now() + MFA_TOKEN_TTL_MS });
      return { status: "mfa_required", mfaToken: token };
    }
    stampLogin(user);
    return { status: "success", user: toSessionUser(user) };
  },

  async verifyMfa(mfaToken, code): Promise<MfaResult> {
    const pending = pendingMfa.get(mfaToken);
    if (!pending || pending.expiresAt < Date.now()) {
      pendingMfa.delete(mfaToken);
      return { status: "invalid" };
    }
    const user = mockDb.users.get(pending.email);
    // Re-apply the login gates: state may have changed between the two steps.
    if (!user || user.locked || user.status === "inactive" || orgSuspended(user)) {
      pendingMfa.delete(mfaToken);
      return { status: "invalid" };
    }
    if (code !== DEMO_MFA_CODE) {
      // The second factor is subject to the AC 7 lockout too (audit finding).
      registerFailure(user);
      return { status: "invalid" };
    }
    pendingMfa.delete(mfaToken); // single-use
    user.failedAttempts = 0;
    stampLogin(user);
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

  async validateSession(sessionUser) {
    const record = mockDb.users.get(sessionUser.email);
    if (!record || record.status === "inactive" || record.locked) return null;
    return { user: toSessionUser(record), labs: record.labs };
  },
};

export { DEMO_PASSWORD };

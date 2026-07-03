import type { AuthApi, LoginResult, MfaResult, ResetResult, SessionUser } from "./types";

// In-memory mock backend. Survives HMR via globalThis; resets on server restart.
// Demo accounts (password for all: LabDemo2026!!):
//   admin@demolab.nl    — plain login
//   analyst@demolab.nl  — MFA required, accepted code: 123456
// Reset flow: any email is accepted; the reset link is printed to the dev
// server console; the token demo-reset-token always works.

const DEMO_PASSWORD = "LabDemo2026!!";
const DEMO_MFA_CODE = "123456";
const DEMO_RESET_TOKEN = "demo-reset-token";
const LOCKOUT_THRESHOLD = 5; // org-configurable in the real backend (AC 7)
const MIN_PASSWORD_LENGTH = 12; // org-configurable (AC 4)

type MockUser = SessionUser & {
  password: string;
  mfaRequired: boolean;
  failedAttempts: number;
  locked: boolean;
};

type MockDb = { users: Map<string, MockUser> };

function seedDb(): MockDb {
  const users = new Map<string, MockUser>();
  const base = { organisation: "Demo Lab", password: DEMO_PASSWORD, failedAttempts: 0, locked: false };
  users.set("admin@demolab.nl", { ...base, email: "admin@demolab.nl", name: "Alex Admin", mfaRequired: false });
  users.set("analyst@demolab.nl", { ...base, email: "analyst@demolab.nl", name: "Sam Analyst", mfaRequired: true });
  return { users };
}

const db: MockDb = ((globalThis as Record<string, unknown>).__limsMockDb ??=
  seedDb()) as MockDb;

function toSessionUser(u: MockUser): SessionUser {
  return { email: u.email, name: u.name, organisation: u.organisation };
}

export const mockAuthApi: AuthApi = {
  async login(email, password): Promise<LoginResult> {
    const user = db.users.get(email.trim().toLowerCase());
    if (!user) return { status: "invalid" };
    if (user.locked) return { status: "locked" };
    if (user.password !== password) {
      user.failedAttempts += 1;
      if (user.failedAttempts >= LOCKOUT_THRESHOLD) user.locked = true;
      return user.locked ? { status: "locked" } : { status: "invalid" };
    }
    user.failedAttempts = 0;
    if (user.mfaRequired) return { status: "mfa_required", mfaToken: `mfa:${user.email}` };
    return { status: "success", user: toSessionUser(user) };
  },

  async verifyMfa(mfaToken, code): Promise<MfaResult> {
    const email = mfaToken.startsWith("mfa:") ? mfaToken.slice(4) : "";
    const user = db.users.get(email);
    if (!user || code !== DEMO_MFA_CODE) return { status: "invalid" };
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
    for (const user of db.users.values()) {
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

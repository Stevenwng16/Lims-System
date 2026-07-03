// The auth contract the frontend is built against (US-A1).
// The mock implementation lives in mock.ts; the real backend plugs in as an
// adapter implementing this same interface (see decision log, 3 Jul 2026).

export type SessionUser = {
  email: string;
  name: string;
  organisation: string;
};

export type LoginResult =
  | { status: "success"; user: SessionUser }
  // Correct password, but the organisation requires a TOTP second factor
  // (US-A1 AC 5): the session must not start until the code is verified.
  | { status: "mfa_required"; mfaToken: string }
  // Generic on purpose — never reveals whether the email exists (AC 3).
  | { status: "invalid" }
  | { status: "locked" };

export type MfaResult =
  | { status: "success"; user: SessionUser }
  | { status: "invalid" };

export type ResetResult = { status: "success" } | { status: "invalid_token" };

export interface AuthApi {
  login(email: string, password: string): Promise<LoginResult>;
  verifyMfa(mfaToken: string, code: string): Promise<MfaResult>;
  /** Always resolves without revealing whether the email exists (AC 3/6). */
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<ResetResult>;
  /** Org password policy shown/enforced client-side; server re-validates (AC 4). */
  passwordPolicy(): Promise<{ minLength: number }>;
}

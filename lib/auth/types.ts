// The auth contract the frontend is built against (US-A1).
// The mock implementation lives in mock.ts; the real backend plugs in as an
// adapter implementing this same interface (see decision log, 3 Jul 2026).

// The four fixed organisation roles of US-A4 AC 1, plus "platform-admin" for
// vendor staff (US-A2 AC 3), who carry no customer organisation. The
// capability matrix lives in lib/permissions.ts.
export type UserRole = "admin" | "lab-manager" | "analyst" | "read-only" | "platform-admin";

export type SessionUser = {
  email: string;
  name: string;
  organisation: string;
  role: UserRole;
};

export type LoginResult =
  | { status: "success"; user: SessionUser }
  // Correct password, but the organisation requires a TOTP second factor
  // (US-A1 AC 5): the session must not start until the code is verified.
  | { status: "mfa_required"; mfaToken: string }
  // Generic on purpose — never reveals whether the email exists (AC 3).
  | { status: "invalid" }
  | { status: "locked" }
  // Organisation suspended (US-A2 AC 6): clear, neutral message; no detail.
  | { status: "org-suspended" };

export type MfaResult =
  | { status: "success"; user: SessionUser }
  | { status: "invalid" };

export type ResetResult = { status: "success" } | { status: "invalid_token" };

// Result of the per-request live re-validation (US-A6 AC 6 / audit finding 4):
// the CURRENT account state, never the cookie snapshot. `labs` is null when
// the backend does not manage lab assignments (the Supabase schema has no
// labs yet) — the caller then falls back to the domain layer's lab data.
export type LiveSession = { user: SessionUser; labs: string[] | null };

export interface AuthApi {
  login(email: string, password: string): Promise<LoginResult>;
  verifyMfa(mfaToken: string, code: string): Promise<MfaResult>;
  /** Always resolves without revealing whether the email exists (AC 3/6). */
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<ResetResult>;
  /** Org password policy shown/enforced client-side; server re-validates (AC 4). */
  passwordPolicy(): Promise<{ minLength: number }>;
  /**
   * Re-validate a session's account against the LIVE store on every request:
   * a demoted / deactivated / locked user takes effect immediately, not only
   * at next login (finding 4). Returns null when the session must die.
   */
  validateSession(sessionUser: SessionUser): Promise<LiveSession | null>;
}

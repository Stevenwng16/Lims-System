import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { passwordPolicyError } from "./password";
import type { AuthApi, LoginResult, MfaResult, ResetResult, SessionUser, UserRole } from "./types";

// Real auth backend against the Supabase project in lims-supabase/
// (migrations 20260703000001..3: organisations, org_settings, user_profiles,
// custom access token hook, RLS). Plugs into lib/auth/index.ts behind the
// AuthApi contract; the app's own session cookie stays as-is on top.

// The DB check constraint currently allows ('admin','user') while the app has
// the five-role matrix of US-A4 — unknown values degrade to read-only until
// the schema is widened to the full enum.
const DB_ROLE_MAP: Record<string, UserRole> = {
  "admin": "admin",
  "lab-manager": "lab-manager",
  "analyst": "analyst",
  "read-only": "read-only",
  "user": "analyst",
  "platform-admin": "platform-admin",
};

const DEFAULT_MIN_PASSWORD_LENGTH = 12;

// The mfaToken handed to the client is factorId.challengeId — both are opaque
// Supabase-issued UUIDs that are only usable with the aal1 session cookie the
// password step just set, so the MFA step stays a continuation of an
// authenticated attempt (mirrors the mock's invariant).
function encodeMfaToken(factorId: string, challengeId: string): string {
  return `${factorId}.${challengeId}`;
}

async function loadSessionUser(supabase: SupabaseClient, user: User): Promise<SessionUser | null> {
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, locked_at, organisations:org_id (name)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) return null;
  const org = profile.organisations as unknown as { name: string } | null;
  return {
    email: user.email ?? "",
    name: (user.user_metadata?.name as string | undefined) ?? user.email ?? "",
    organisation: org?.name ?? "",
    role: DB_ROLE_MAP[profile.role] ?? "read-only",
  };
}

export const supabaseAuthApi: AuthApi = {
  async login(email, password): Promise<LoginResult> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    // Deliberately generic: Supabase does not reveal whether the email
    // exists, and neither do we (AC 3).
    if (error || !data.user) return { status: "invalid" };

    // Lockout (AC 7): profile carries locked_at; a locked account never gets
    // a session even with the right password.
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("locked_at")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (profile?.locked_at) {
      await supabase.auth.signOut();
      return { status: "locked" };
    }

    // Second factor (AC 5): if the account has a verified TOTP factor the
    // session is only aal1 — challenge it and hold the app session until
    // verifyMfa succeeds.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (totp) {
        const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
          factorId: totp.id,
        });
        if (chErr || !challenge) return { status: "invalid" };
        return { status: "mfa_required", mfaToken: encodeMfaToken(totp.id, challenge.id) };
      }
    }

    const user = await loadSessionUser(supabase, data.user);
    if (!user) {
      // Auth record without a tenant profile — treat as not provisioned.
      await supabase.auth.signOut();
      return { status: "invalid" };
    }
    return { status: "success", user };
  },

  async verifyMfa(mfaToken, code): Promise<MfaResult> {
    const [factorId, challengeId] = mfaToken.split(".");
    if (!factorId || !challengeId) return { status: "invalid" };
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
    if (error) return { status: "invalid" };
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { status: "invalid" };
    const user = await loadSessionUser(supabase, data.user);
    if (!user) return { status: "invalid" };
    return { status: "success", user };
  },

  async requestPasswordReset(email): Promise<void> {
    const supabase = await createSupabaseServerClient();
    // Resolves regardless of whether the account exists (AC 3/6). The
    // recovery template links to /reset-password?token={{ .TokenHash }}.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/reset-password`,
    });
  },

  async resetPassword(token, newPassword): Promise<ResetResult> {
    // Same policy gate as the mock (US-A1 AC 4 — requireComplexity wired
    // 17 Jul 2026); the DB-side policy re-validates when this adapter goes
    // live with tenant-scoped settings.
    if (
      passwordPolicyError(newPassword, {
        minPasswordLength: DEFAULT_MIN_PASSWORD_LENGTH,
        requireComplexity: true,
      }) !== null
    ) {
      return { status: "invalid_token" };
    }
    const supabase = await createSupabaseServerClient();
    const { error: otpError } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: token,
    });
    if (otpError) return { status: "invalid_token" };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    // The reset flow ends at the login screen; don't leave a live session.
    await supabase.auth.signOut();
    if (error) return { status: "invalid_token" };
    return { status: "success" };
  },

  async passwordPolicy(): Promise<{ minLength: number; requireComplexity: boolean }> {
    // Shown pre-login, so no org context yet; org_settings re-validates
    // server-side once tenant-scoped policy reads are needed (AC 4).
    // Complexity mirrors the provisioning default (safe default = on).
    return { minLength: DEFAULT_MIN_PASSWORD_LENGTH, requireComplexity: true };
  },

  async validateSession(sessionUser) {
    const supabase = await createSupabaseServerClient();
    // getUser() verifies the token with the auth server — the app cookie is
    // only honoured while the underlying Supabase session is still alive and
    // belongs to the same account.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      console.warn("[auth] validateSession: no live Supabase user —", error?.message ?? "no user");
      return null;
    }
    if ((data.user.email ?? "").toLowerCase() !== sessionUser.email.toLowerCase()) {
      console.warn("[auth] validateSession: cookie/user email mismatch");
      return null;
    }
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, locked_at, organisations:org_id (name)")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (!profile || profile.locked_at) {
      console.warn(
        "[auth] validateSession: profile unavailable or locked —",
        profileError?.message ?? (profile ? "locked" : "no row (check RLS / access token hook)"),
      );
      return null;
    }
    const org = profile.organisations as unknown as { name: string } | null;
    return {
      user: {
        email: data.user.email ?? "",
        name: (data.user.user_metadata?.name as string | undefined) ?? data.user.email ?? "",
        organisation: org?.name ?? "",
        role: DB_ROLE_MAP[profile.role] ?? "read-only",
      },
      // No lab assignments in the auth schema yet — the caller falls back to
      // the domain layer's labs for the organisation.
      labs: null,
    };
  },
};

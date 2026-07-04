"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authApi } from "@/lib/auth";
import { encodeSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { decodeSupportSession, SUPPORT_COOKIE } from "@/lib/platform/support-session";
import { platformApi } from "@/lib/platform";
import type { SessionUser } from "@/lib/auth";

export type AuthFormState = {
  error?: string;
  mfaToken?: string;
  info?: string;
};

// A stray support cookie must never travel into a new session — it would apply
// another organisation's context to whoever logs in next (audit finding 6).
async function clearSupportCookie(): Promise<void> {
  const cookieStore = await cookies();
  const support = decodeSupportSession(cookieStore.get(SUPPORT_COOKIE)?.value);
  if (support) await platformApi.endSupportSession(support.orgId);
  cookieStore.delete(SUPPORT_COOKIE);
}

async function startSession(user: SessionUser): Promise<never> {
  await clearSupportCookie();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodeSession(user), sessionCookieOptions);
  redirect("/");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const result = await authApi.login(email, password);
  switch (result.status) {
    case "success":
      return startSession(result.user);
    case "mfa_required":
      return { mfaToken: result.mfaToken };
    case "locked":
      return {
        error:
          "This account is locked after too many failed attempts. Reset your password to restore access, or contact your administrator.",
      };
    case "org-suspended":
      // Clear and neutral (US-A2 AC 6): no reason, no detail.
      return {
        error:
          "Access for your organisation is currently unavailable. Please contact your administrator.",
      };
    case "invalid":
      // Generic on purpose (AC 3) — must not reveal whether the email exists.
      return { error: "Invalid email or password." };
  }
}

export async function verifyMfaAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const mfaToken = String(formData.get("mfaToken") ?? "");
  const code = String(formData.get("code") ?? "");
  const result = await authApi.verifyMfa(mfaToken, code);
  if (result.status === "success") return startSession(result.user);
  return { mfaToken, error: "That code is not valid. Try again." };
}

export async function forgotPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  if (!email) return { error: "Enter your email address." };
  await authApi.requestPasswordReset(email);
  // Same response whether or not the account exists (AC 3/6).
  return { info: "If an account exists for that address, a reset link has been sent." };
}

export async function resetPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const { minLength } = await authApi.passwordPolicy();

  if (password.length < minLength) {
    return { error: `Password must be at least ${minLength} characters.` };
  }
  if (password !== confirm) return { error: "Passwords do not match." };

  const result = await authApi.resetPassword(token, password);
  if (result.status === "success") {
    return { info: "Your password has been reset. You can now log in." };
  }
  return { error: "This reset link is invalid or has expired. Request a new one." };
}

export async function logoutAction(): Promise<never> {
  await clearSupportCookie();
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}

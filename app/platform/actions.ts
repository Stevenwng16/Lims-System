"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { platformApi } from "@/lib/platform";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import {
  encodeSupportSession,
  SUPPORT_COOKIE,
} from "@/lib/platform/support-session";

export type PlatformFormState = { error?: string; success?: boolean };

async function requirePlatformAdmin() {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  // UI hiding is presentation — this check is the mock's stand-in for the
  // real server-side enforcement (invariant 4).
  if (session?.user.role !== "platform-admin") redirect("/");
}

export async function provisionOrganisationAction(
  _prev: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  await requirePlatformAdmin();
  const result = await platformApi.provisionOrganisation(
    String(formData.get("name") ?? ""),
    String(formData.get("adminEmail") ?? ""),
  );
  if (result.status === "error") return { error: result.message };
  revalidatePath("/platform");
  return { success: true };
}

export async function suspendOrganisationAction(
  _prev: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  await requirePlatformAdmin();
  const result = await platformApi.suspendOrganisation(
    String(formData.get("orgId") ?? ""),
    String(formData.get("reason") ?? ""),
  );
  if (result.status === "error") return { error: result.message };
  revalidatePath("/platform");
  return { success: true };
}

export async function reactivateOrganisationAction(
  _prev: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  await requirePlatformAdmin();
  const result = await platformApi.reactivateOrganisation(
    String(formData.get("orgId") ?? ""),
    String(formData.get("reason") ?? ""),
  );
  if (result.status === "error") return { error: result.message };
  revalidatePath("/platform");
  return { success: true };
}

export async function openSupportSessionAction(
  _prev: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  await requirePlatformAdmin();
  const orgId = String(formData.get("orgId") ?? "");
  const result = await platformApi.openSupportSession(orgId);
  if (result.status === "error") return { error: result.message };

  const cookieStore = await cookies();
  cookieStore.set(
    SUPPORT_COOKIE,
    encodeSupportSession({
      orgId,
      orgName: result.orgName ?? orgId,
      allowAdmin: result.allowAdmin ?? false,
      expiresAt: Date.now() + 8 * 3600_000, // session marker; grant expiry is enforced in the API
    }),
    { httpOnly: true, sameSite: "lax", path: "/" },
  );
  redirect("/"); // vendor now sees the customer environment, banner on (AC 9)
}

export async function endSupportSessionAction(formData: FormData): Promise<void> {
  const orgId = String(formData.get("orgId") ?? "");
  await platformApi.endSupportSession(orgId);
  const cookieStore = await cookies();
  cookieStore.delete(SUPPORT_COOKIE);
  redirect("/platform");
}

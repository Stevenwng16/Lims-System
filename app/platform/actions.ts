"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { platformApi } from "@/lib/platform";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { mockDb } from "@/lib/mock-db";
import {
  decodeSupportSession,
  encodeSupportSession,
  SUPPORT_COOKIE,
} from "@/lib/platform/support-session";

export type PlatformFormState = { error?: string; success?: boolean };

async function requirePlatformAdmin() {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  // UI hiding is presentation — this check is the mock's stand-in for the
  // real server-side enforcement (invariant 4). Live-revalidated against the
  // store, never the cookie snapshot alone (Fable re-review finding 23).
  if (session?.user.role !== "platform-admin") redirect("/");
  const record = mockDb.users.get(session.user.email);
  if (!record || record.role !== "platform-admin" || record.status === "inactive" || record.locked) {
    redirect("/session-expired");
  }
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
      // Cap the cookie to the grant so it can never outlive it (finding 5).
      expiresAt: Math.min(Date.now() + 8 * 3600_000, result.grantExpiresAt ?? Date.now()),
    }),
    { httpOnly: true, sameSite: "lax", path: "/" },
  );
  redirect("/"); // vendor now sees the customer environment, banner on (AC 9)
}

export async function endSupportSessionAction(): Promise<void> {
  // Platform-admin only, and the org is taken from the caller's OWN support
  // cookie — never arbitrary form data (audit finding 11).
  await requirePlatformAdmin();
  const cookieStore = await cookies();
  const support = decodeSupportSession(cookieStore.get(SUPPORT_COOKIE)?.value);
  if (support) await platformApi.endSupportSession(support.orgId);
  cookieStore.delete(SUPPORT_COOKIE);
  redirect("/platform");
}

"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { platformApi } from "@/lib/platform";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";

export type SupportAccessFormState = { error?: string; success?: boolean };

// Mock stand-in for real server-side enforcement (invariant 4): only the
// organisation's own Admin manages its support grants (US-A2 AC 8).
async function requireOrgAdmin(): Promise<string> {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (session?.user.role !== "org-admin") redirect("/");
  // Mock: resolve the org id from the organisation name in the session.
  return session.user.organisation === "Demo Lab" ? "org-demolab" : "org-unknown";
}

export async function grantSupportAccessAction(
  _prev: SupportAccessFormState,
  formData: FormData,
): Promise<SupportAccessFormState> {
  const orgId = await requireOrgAdmin();
  const durationHours = Number(formData.get("duration") ?? 72);
  const allowAdmin = formData.get("allowAdmin") === "on";
  const result = await platformApi.grantSupportAccess(orgId, durationHours, allowAdmin);
  if (result.status === "error") return { error: result.message };
  revalidatePath("/settings/support-access");
  return { success: true };
}

export async function revokeSupportAccessAction(
  _prev: SupportAccessFormState,
  _formData: FormData,
): Promise<SupportAccessFormState> {
  const orgId = await requireOrgAdmin();
  const result = await platformApi.revokeSupportAccess(orgId);
  if (result.status === "error") return { error: result.message };
  revalidatePath("/settings/support-access");
  return { success: true };
}

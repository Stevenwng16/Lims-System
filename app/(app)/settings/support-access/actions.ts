"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { platformApi } from "@/lib/platform";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getOrgIdByName, mockDb } from "@/lib/mock-db";

export type SupportAccessFormState = { error?: string; success?: boolean };

const ALLOWED_DURATIONS = [24, 72, 168];

// Mock stand-in for real server-side enforcement (invariant 4): only the
// organisation's own live Admin manages its support grants (US-A2 AC 8). Grant
// management is deliberately NOT reachable through a support session — the
// customer decides who gets in, never the vendor. Works for ANY organisation,
// not just Demo Lab (audit finding 7).
export async function requireOrgAdmin(): Promise<string> {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  // Live re-validation — a demoted/deactivated admin cannot manage grants.
  const record = mockDb.users.get(session.user.email);
  if (!record || record.role !== "admin" || record.status === "inactive" || record.locked) {
    redirect("/");
  }
  const orgId = getOrgIdByName(session.user.organisation);
  // A suspended organisation's admin cannot manage grants either (US-A2 AC 6;
  // Fable re-review findings 2/22) — same gate as resolveOrgContext.
  if (!orgId || mockDb.organisations.get(orgId)?.status !== "active") {
    redirect("/session-expired");
  }
  return orgId;
}

export async function grantSupportAccessAction(
  _prev: SupportAccessFormState,
  formData: FormData,
): Promise<SupportAccessFormState> {
  const orgId = await requireOrgAdmin();
  const durationHours = Number(formData.get("duration") ?? 72);
  if (!ALLOWED_DURATIONS.includes(durationHours)) {
    return { error: "Choose a valid duration (24, 72 or 168 hours)." };
  }
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

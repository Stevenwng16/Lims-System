"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { labApi } from "@/lib/labs";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { decodeSupportSession, SUPPORT_COOKIE } from "@/lib/platform/support-session";
import { effectiveOrgRole } from "@/lib/permissions";
import { getOrgIdByName } from "@/lib/mock-db";

export type LabFormState = { error?: string; success?: boolean };

// Mock stand-in for real server-side enforcement (invariant 4): lab
// management is Admin-only (US-A5 authorization). Support sessions with
// admin rights pass the same matrix (US-A4 AC 13).
async function requireAdminOrgId(): Promise<string> {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  const supportSession = decodeSupportSession(cookieStore.get(SUPPORT_COOKIE)?.value);
  if (effectiveOrgRole(session.user, supportSession) !== "admin") redirect("/");
  const orgId = supportSession?.orgId ?? getOrgIdByName(session.user.organisation);
  if (!orgId) redirect("/");
  return orgId;
}

export async function createLabAction(
  _prev: LabFormState,
  formData: FormData,
): Promise<LabFormState> {
  const orgId = await requireAdminOrgId();
  const result = await labApi.createLab(orgId, {
    name: String(formData.get("name") ?? ""),
    code: String(formData.get("code") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  if (result.status === "error") return { error: result.message };
  revalidatePath("/admin/labs");
  return { success: true };
}

export async function updateLabAction(
  _prev: LabFormState,
  formData: FormData,
): Promise<LabFormState> {
  const orgId = await requireAdminOrgId();
  const labId = String(formData.get("labId") ?? "");

  const result = await labApi.updateLab(orgId, labId, {
    name: String(formData.get("name") ?? ""),
    code: String(formData.get("code") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  if (result.status === "error") return { error: result.message };

  // The edit dialog carries the status radio (per the story sketch): apply a
  // change through the guarded transition so AC 5/7 always hold. A real
  // status change requires a reason (invariant 2) — the API no-ops when the
  // status is unchanged.
  const requestedStatus = formData.get("status") === "inactive" ? "inactive" : "active";
  const statusResult = await labApi.setLabStatus(
    orgId,
    labId,
    requestedStatus,
    String(formData.get("statusReason") ?? ""),
  );
  if (statusResult.status === "error") return { error: statusResult.message };

  revalidatePath("/admin/labs");
  return { success: true };
}

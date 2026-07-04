"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { labApi } from "@/lib/labs";
import { resolveOrgContext } from "@/lib/auth/context";

export type LabFormState = { error?: string; success?: boolean };

// Lab management is Admin-only (US-A5 authorization); support sessions with
// admin rights pass the same matrix (US-A4 AC 13). Live-validated + org-gated
// via the shared resolver (audit findings 4/6).
async function requireAdminOrgId(): Promise<string> {
  const ctx = await resolveOrgContext();
  if (ctx.role !== "admin" || !ctx.orgId) redirect("/");
  return ctx.orgId;
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
  const requestedStatus = formData.get("status") === "inactive" ? "inactive" : "active";
  const statusReason = String(formData.get("statusReason") ?? "");

  // Validate the status change BEFORE mutating anything, so a rejected
  // deactivation never leaves the field edits (and rename remap) half-committed
  // (audit finding 20).
  const guard = await labApi.checkLabStatusChange(orgId, labId, requestedStatus, statusReason);
  if (guard.status === "error") return { error: guard.message };

  const result = await labApi.updateLab(orgId, labId, {
    name: String(formData.get("name") ?? ""),
    code: String(formData.get("code") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  if (result.status === "error") return { error: result.message };

  const statusResult = await labApi.setLabStatus(orgId, labId, requestedStatus, statusReason);
  if (statusResult.status === "error") return { error: statusResult.message };

  revalidatePath("/admin/labs");
  return { success: true };
}

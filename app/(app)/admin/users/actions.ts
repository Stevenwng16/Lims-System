"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { userApi, type Actor } from "@/lib/users";
import { resolveOrgContext } from "@/lib/auth/context";
import type { OrgRole } from "@/lib/permissions";

export type UserFormState = { error?: string; success?: boolean; info?: string };

// Resolve the acting user server-side (invariant 4), live-validated. Admins and
// lab managers only (US-A6 authorization); support sessions map through the
// US-A4 matrix (an admin-rights grant acts as admin, read-only cannot manage).
export async function resolveActor(): Promise<Actor> {
  const ctx = await resolveOrgContext();
  if (ctx.role !== "admin" && ctx.role !== "lab-manager") redirect("/");
  return { email: ctx.user.email, role: ctx.role, labs: ctx.labs, orgId: ctx.orgId };
}

function parseInput(formData: FormData) {
  return {
    // Blind cast is safe: lib/users/mock.ts validates the role against the four
    // fixed OrgRole values (audit finding 17) so junk / "platform-admin" is
    // rejected server-side regardless of what is posted.
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "read-only") as OrgRole,
    labs: formData.getAll("labs").map(String),
    clearances: formData.getAll("clearances").map(String),
  };
}

export async function createUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await resolveActor();
  const result = await userApi.createUser(actor, parseInput(formData));
  if (result.status === "error") return { error: result.message };
  revalidatePath("/admin/users");
  return { success: true };
}

export async function updateUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await resolveActor();
  const result = await userApi.updateUser(actor, String(formData.get("targetEmail") ?? ""), {
    ...parseInput(formData),
    status: formData.get("status") === "inactive" ? "inactive" : "active",
  });
  if (result.status === "error") return { error: result.message };
  revalidatePath("/admin/users");
  return { success: true };
}

export async function sendPasswordResetAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await resolveActor();
  const targetEmail = String(formData.get("targetEmail") ?? "");
  const result = await userApi.sendPasswordReset(actor, targetEmail);
  if (result.status === "error") return { error: result.message };
  return { info: `Password reset sent to ${targetEmail}.` };
}

export async function unlockAccountAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await resolveActor();
  const result = await userApi.unlockAccount(actor, String(formData.get("targetEmail") ?? ""));
  if (result.status === "error") return { error: result.message };
  revalidatePath("/admin/users");
  return { info: "Account unlocked." };
}

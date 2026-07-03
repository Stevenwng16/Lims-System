"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { userApi, type Actor } from "@/lib/users";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { decodeSupportSession, SUPPORT_COOKIE } from "@/lib/platform/support-session";
import { effectiveOrgRole, type OrgRole } from "@/lib/permissions";
import { getOrgIdByName, mockDb } from "@/lib/mock-db";

export type UserFormState = { error?: string; success?: boolean; info?: string };

// Resolve the acting user server-side (invariant 4). Admins and lab managers
// only (US-A6 authorization); support sessions map through the US-A4 matrix.
export async function resolveActor(): Promise<Actor> {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  const supportSession = decodeSupportSession(cookieStore.get(SUPPORT_COOKIE)?.value);
  const role = effectiveOrgRole(session.user, supportSession);
  if (role !== "admin" && role !== "lab-manager") redirect("/");

  const orgId = supportSession?.orgId ?? getOrgIdByName(session.user.organisation);
  if (!orgId) redirect("/");
  const record = mockDb.users.get(session.user.email);
  return {
    email: session.user.email,
    role,
    labs: record?.labs ?? [],
    orgId,
  };
}

function parseInput(formData: FormData) {
  return {
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

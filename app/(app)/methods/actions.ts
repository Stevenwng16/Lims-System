"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { methodApi, type MethodActor, type MethodInput } from "@/lib/methods";
import type { MethodAnalyte } from "@/lib/mock-db";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { decodeSupportSession, SUPPORT_COOKIE } from "@/lib/platform/support-session";
import { effectiveOrgRole } from "@/lib/permissions";
import { getOrgIdByName, mockDb } from "@/lib/mock-db";

export type MethodFormState = { error?: string; success?: boolean; newVersion?: number };

// All org roles may view methods; the mock API enforces manage rights
// (admin / lab manager within own labs) per call. Mock stand-in for
// invariant 4.
export async function resolveMethodActor(): Promise<MethodActor> {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  const supportSession = decodeSupportSession(cookieStore.get(SUPPORT_COOKIE)?.value);
  const role = effectiveOrgRole(session.user, supportSession);
  if (role === null) redirect("/");

  const orgId = supportSession?.orgId ?? getOrgIdByName(session.user.organisation);
  if (!orgId) redirect("/");
  // A support session grants org-wide lab visibility (the vendor has no lab
  // assignments of their own); role still limits what they can DO — a
  // read-only grant can see but never manage (US-A2 AC 9 / US-A4 AC 13).
  const labs =
    session.user.role === "platform-admin" && supportSession
      ? [...mockDb.labs.values()].filter((l) => l.orgId === orgId).map((l) => l.name)
      : (mockDb.users.get(session.user.email)?.labs ?? []);
  return { email: session.user.email, role, labs, orgId };
}

function parseInput(formData: FormData): MethodInput | { parseError: string } {
  try {
    const steps = JSON.parse(String(formData.get("stepsJson") ?? "[]")) as { id: string; name: string }[];
    const analytes = JSON.parse(String(formData.get("analytesJson") ?? "[]")) as MethodAnalyte[];
    return {
      name: String(formData.get("name") ?? ""),
      code: String(formData.get("code") ?? ""),
      labId: String(formData.get("labId") ?? ""),
      description: String(formData.get("description") ?? ""),
      accredited: formData.get("accredited") === "on",
      maxSamplesPerBatch: Number(formData.get("maxSamplesPerBatch")),
      steps: steps.map((s) => ({ id: s.id, name: s.name })),
      analytes: analytes.map((a) => ({
        id: a.id,
        name: a.name,
        unit: a.unit,
        decimals: Number(a.decimals),
        loq: a.loq === null || a.loq === "" ? null : String(a.loq),
      })),
    };
  } catch {
    return { parseError: "The form data could not be read — reload the page and try again." };
  }
}

export async function createMethodAction(
  _prev: MethodFormState,
  formData: FormData,
): Promise<MethodFormState> {
  const actor = await resolveMethodActor();
  const input = parseInput(formData);
  if ("parseError" in input) return { error: input.parseError };
  const result = await methodApi.createMethod(actor, input);
  if (result.status === "error") return { error: result.message };
  revalidatePath("/methods");
  redirect(`/methods/${result.methodId}`);
}

export async function updateMethodAction(
  _prev: MethodFormState,
  formData: FormData,
): Promise<MethodFormState> {
  const actor = await resolveMethodActor();
  const input = parseInput(formData);
  if ("parseError" in input) return { error: input.parseError };
  const methodId = String(formData.get("methodId") ?? "");
  const result = await methodApi.updateMethod(actor, methodId, input);
  if (result.status === "error") return { error: result.message };
  revalidatePath("/methods");
  revalidatePath(`/methods/${methodId}`);
  return { success: true, newVersion: result.newVersion };
}

export async function setMethodStatusAction(
  _prev: MethodFormState,
  formData: FormData,
): Promise<MethodFormState> {
  const actor = await resolveMethodActor();
  const methodId = String(formData.get("methodId") ?? "");
  const status = formData.get("status") === "inactive" ? "inactive" : "active";
  const result = await methodApi.setMethodStatus(
    actor,
    methodId,
    status,
    String(formData.get("reason") ?? ""),
  );
  if (result.status === "error") return { error: result.message };
  revalidatePath("/methods");
  revalidatePath(`/methods/${methodId}`);
  return { success: true };
}

export async function replaceTemplateAction(
  _prev: MethodFormState,
  formData: FormData,
): Promise<MethodFormState> {
  const actor = await resolveMethodActor();
  const methodId = String(formData.get("methodId") ?? "");
  const file = formData.get("templateFile");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a template file to upload." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await methodApi.replaceTemplate(actor, methodId, {
    fileName: file.name,
    bytes,
    hasResultsSheet: formData.get("hasResultsSheet") === "on",
  });
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/methods/${methodId}`);
  return { success: true, newVersion: result.newVersion };
}

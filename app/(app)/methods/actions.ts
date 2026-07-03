"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { methodApi, type MethodActor, type MethodInput } from "@/lib/methods";
import type { MethodAnalyte } from "@/lib/mock-db";
import { resolveOrgContext } from "@/lib/auth/context";

export type MethodFormState = { error?: string; success?: boolean; newVersion?: number };

// All org roles may view methods; the mock API enforces manage rights (admin /
// lab manager within own labs) per call. Live-validated + org-gated via the
// shared resolver, which also gives a support session org-wide lab visibility
// (audit findings 4/6). A read-only grant sees but never manages (US-A4 AC 13).
export async function resolveMethodActor(): Promise<MethodActor> {
  const ctx = await resolveOrgContext();
  if (ctx.role === null || !ctx.orgId) redirect("/");
  return { email: ctx.user.email, role: ctx.role, labs: ctx.labs, orgId: ctx.orgId };
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

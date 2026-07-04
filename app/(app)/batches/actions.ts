"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { batchApi, type BatchActor, type BatchCompositionInput } from "@/lib/batches";
import { resolveOrgContext } from "@/lib/auth/context";

export type BatchFormState = { error?: string; success?: boolean };

// All org roles may view batches (lab-scoped); the mock API gates creating and
// composition editing per US-D1's authorization (incl. the analyst per-lab
// setting + clearance, checked against the live store — invariant 4).
export async function resolveBatchActor(): Promise<BatchActor> {
  const ctx = await resolveOrgContext();
  if (ctx.role === null || !ctx.orgId) redirect("/platform");
  return {
    email: ctx.user.email,
    role: ctx.role,
    labs: ctx.labs,
    orgId: ctx.orgId,
    isSupport: ctx.isSupport,
  };
}

function parseComposition(formData: FormData): BatchCompositionInput | null {
  try {
    const sampleIds = JSON.parse(String(formData.get("sampleIdsJson") ?? "[]")) as unknown[];
    const confirm = JSON.parse(String(formData.get("confirmJson") ?? "[]")) as unknown[];
    const qc = JSON.parse(String(formData.get("qcJson") ?? "[]")) as unknown[];
    return {
      sampleIds: sampleIds.map(String),
      confirmAddMethod: confirm.map(String),
      qc: qc.map((entry) => {
        const item = entry as { materialId?: unknown; quantity?: unknown };
        return { materialId: String(item.materialId ?? ""), quantity: Number(item.quantity) };
      }),
    };
  } catch {
    return null;
  }
}

export async function createBatchAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const composition = parseComposition(formData);
  if (!composition) return { error: "The composition could not be read — reload and try again." };

  const result = await batchApi.createBatch(actor, {
    ...composition,
    labId: String(formData.get("labId") ?? ""),
    methodId: String(formData.get("methodId") ?? ""),
  });
  if (result.status === "error") return { error: result.message };

  revalidatePath("/batches");
  revalidatePath("/jobs"); // derived sample/job statuses change with membership
  redirect(`/batches/${result.batchId}`); // sketch: the batch detail opens
}

export async function completeStepAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  let equipment: { typeId: string; equipmentId: string }[];
  try {
    const parsed = JSON.parse(String(formData.get("equipmentJson") ?? "[]")) as unknown[];
    equipment = parsed.map((e) => {
      const item = e as { typeId?: unknown; equipmentId?: unknown };
      return { typeId: String(item.typeId ?? ""), equipmentId: String(item.equipmentId ?? "") };
    });
  } catch {
    return { error: "The equipment selection could not be read — reload and try again." };
  }
  const result = await batchApi.completeStep(
    actor,
    batchId,
    Number(formData.get("expectedStepIndex")), // AC 10 concurrency token
    equipment,
  );
  if (result.status === "error") return { error: result.message };
  revalidatePath("/batches");
  revalidatePath(`/batches/${batchId}`);
  revalidatePath("/jobs"); // derived sample/job statuses follow the workflow
  return { success: true };
}

export async function setBackAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  const result = await batchApi.setBackStep(
    actor,
    batchId,
    Number(formData.get("toStepIndex")),
    String(formData.get("reason") ?? ""),
  );
  if (result.status === "error") return { error: result.message };
  revalidatePath("/batches");
  revalidatePath(`/batches/${batchId}`);
  return { success: true };
}

export async function voidBatchAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  const result = await batchApi.voidBatch(actor, batchId, String(formData.get("reason") ?? ""));
  if (result.status === "error") return { error: result.message };
  revalidatePath("/batches");
  revalidatePath(`/batches/${batchId}`);
  revalidatePath("/jobs"); // voided batch → samples derive back to Received
  return { success: true };
}

export async function uploadWorksheetAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > 5 * 1024 * 1024) return { error: "Worksheets are limited to 5 MB in the mock." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await batchApi.uploadWorksheet(actor, batchId, { fileName: file.name, bytes });
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/batches/${batchId}`);
  return { success: true };
}

export async function updateCompositionAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  const composition = parseComposition(formData);
  if (!composition) return { error: "The composition could not be read — reload and try again." };

  const result = await batchApi.updateComposition(actor, batchId, composition);
  if (result.status === "error") return { error: result.message };

  revalidatePath("/batches");
  revalidatePath(`/batches/${batchId}`);
  revalidatePath("/jobs");
  return { success: true };
}

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

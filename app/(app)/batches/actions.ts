"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  batchApi,
  type BatchActor,
  type BatchCompositionInput,
  type BulkEntry,
  type BulkPreviewCell,
  type ImportConfigInput,
  type ImportPreview,
  type ImportResolution,
  type ResultValueInput,
} from "@/lib/batches";
import { resolveOrgContext } from "@/lib/auth/context";

export type BatchFormState = {
  error?: string;
  success?: boolean;
  /** Informational follow-up on success (e.g. the AC 14 auto-read outcome
   * after a worksheet upload — pass-3 review fix). */
  notice?: string;
};
export type BulkFormState = {
  error?: string;
  success?: boolean;
  preview?: BulkPreviewCell[];
  notices?: string[];
  worksheetVersion?: number;
  /** One-use staging token — the confirm applies exactly the staged preview
   * or refuses (pass-3 review fix, mirroring the import contract). */
  token?: string;
};
export type ImportFormState = {
  error?: string;
  success?: boolean;
  preview?: ImportPreview;
};

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
  // AC 14: surface the auto-read outcome at upload — either the pending-
  // preview prompt or the missing/mismatching-sheet notice (pass-3 fix).
  return { success: true, notice: result.autoRead?.message };
}

function parseResultValueInput(formData: FormData): ResultValueInput {
  const kind = String(formData.get("valueKind") ?? "numeric");
  switch (kind) {
    case "censored":
      return {
        kind: "censored",
        // Whitelisted server-side in the mock API.
        qualifier: String(formData.get("qualifier") ?? "") as "<" | ">",
        boundaryRaw: String(formData.get("boundaryRaw") ?? ""),
      };
    case "qualifier":
      return { kind: "qualifier", qualifierId: String(formData.get("qualifierId") ?? "") };
    case "text":
      return { kind: "text", text: String(formData.get("text") ?? "") };
    case "no-result":
      return { kind: "no-result", reason: String(formData.get("noResultReason") ?? "") };
    default:
      return { kind: "numeric", raw: String(formData.get("raw") ?? "") };
  }
}

export async function enterResultAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  const expectedCurrent = String(formData.get("expectedCurrentRecordId") ?? "");
  const result = await batchApi.enterResult(
    actor,
    batchId,
    {
      targetType: formData.get("targetType") === "qc" ? "qc" : "sample",
      targetId: String(formData.get("targetId") ?? ""),
    },
    String(formData.get("analyteId") ?? ""),
    parseResultValueInput(formData),
    String(formData.get("supersedeReason") ?? ""),
    // The record the dialog showed as current; "" = the user saw an empty
    // cell. Anchors the correction against concurrent writes (pass-3 fix).
    expectedCurrent === "" ? null : expectedCurrent,
  );
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/batches/${batchId}`);
  return { success: true };
}

function parseBulkEntries(formData: FormData): BulkEntry[] | null {
  try {
    const parsed = JSON.parse(String(formData.get("entriesJson") ?? "[]")) as unknown[];
    return parsed.map((e) => {
      const item = e as { targetType?: unknown; targetId?: unknown; analyteId?: unknown; raw?: unknown };
      return {
        target: {
          targetType: item.targetType === "qc" ? ("qc" as const) : ("sample" as const),
          targetId: String(item.targetId ?? ""),
        },
        analyteId: String(item.analyteId ?? ""),
        raw: String(item.raw ?? ""),
      };
    });
  } catch {
    return null;
  }
}

export async function previewPasteAction(
  _prev: BulkFormState,
  formData: FormData,
): Promise<BulkFormState> {
  const actor = await resolveBatchActor();
  const entries = parseBulkEntries(formData);
  if (!entries) return { error: "The pasted block could not be read — try again." };
  const result = await batchApi.previewBulk(actor, String(formData.get("batchId") ?? ""), entries);
  if (result.status === "error") return { error: result.message };
  return { preview: result.cells, token: result.token };
}

export async function confirmPasteAction(
  _prev: BulkFormState,
  formData: FormData,
): Promise<BulkFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  // Only the staging token travels: the confirm writes EXACTLY the staged
  // preview or refuses — a post-preview client-side edit can never reach the
  // records (pass-3 review fix).
  const result = await batchApi.confirmBulk(actor, batchId, String(formData.get("token") ?? ""));
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/batches/${batchId}`);
  return { success: true };
}

export async function previewWorksheetAction(
  _prev: BulkFormState,
  formData: FormData,
): Promise<BulkFormState> {
  const actor = await resolveBatchActor();
  const result = await batchApi.previewWorksheet(actor, String(formData.get("batchId") ?? ""));
  if (result.status === "error") return { error: result.message };
  return {
    preview: result.cells,
    notices: result.notices,
    worksheetVersion: result.worksheetVersion,
    token: result.token,
  };
}

export async function confirmWorksheetAction(
  _prev: BulkFormState,
  formData: FormData,
): Promise<BulkFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  // The server re-reads the worksheet itself; the token pins the confirm to
  // the previewed version + outcomes (pass-3 review fix).
  const result = await batchApi.confirmWorksheet(actor, batchId, String(formData.get("token") ?? ""));
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/batches/${batchId}`);
  return { success: true };
}

export async function claimBatchAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  const result = await batchApi.claimBatch(actor, batchId);
  if (result.status === "error") return { error: result.message };
  revalidatePath("/batches");
  revalidatePath(`/batches/${batchId}`);
  return { success: true };
}

export async function releaseClaimAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  const result = await batchApi.releaseClaim(actor, batchId);
  if (result.status === "error") return { error: result.message };
  revalidatePath("/batches");
  revalidatePath(`/batches/${batchId}`);
  return { success: true };
}

export async function assignBatchAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  const raw = String(formData.get("assignee") ?? "");
  const result = await batchApi.assignBatch(actor, batchId, raw === "" ? null : raw);
  if (result.status === "error") return { error: result.message };
  revalidatePath("/batches");
  revalidatePath(`/batches/${batchId}`);
  return { success: true };
}

function parseImportConfigInput(formData: FormData): ImportConfigInput | null {
  try {
    const columns = JSON.parse(String(formData.get("columnsJson") ?? "[]")) as unknown[];
    const longUnits = JSON.parse(String(formData.get("longUnitsJson") ?? "[]")) as unknown[];
    return {
      name: String(formData.get("name") ?? ""),
      labId: String(formData.get("labId") ?? ""),
      // Whitelisted server-side in the mock API.
      fileType: String(formData.get("fileType") ?? "csv") as "csv" | "excel",
      sheetName: String(formData.get("sheetName") ?? ""),
      orientation: String(formData.get("orientation") ?? "wide") as "wide" | "long",
      idColumn: String(formData.get("idColumn") ?? ""),
      columns: columns.map((c) => {
        const item = c as { header?: unknown; analyteName?: unknown; unit?: unknown };
        return {
          header: String(item.header ?? ""),
          analyteName: String(item.analyteName ?? ""),
          unit: item.unit === null ? null : String(item.unit ?? ""),
        };
      }),
      analyteColumn: String(formData.get("analyteColumn") ?? ""),
      valueColumn: String(formData.get("valueColumn") ?? ""),
      longUnits: longUnits.map((u) => {
        const item = u as { analyteName?: unknown; unit?: unknown };
        return {
          analyteName: String(item.analyteName ?? ""),
          unit: item.unit === null ? null : String(item.unit ?? ""),
        };
      }),
      decimalSeparator: String(formData.get("decimalSeparator") ?? "point") as "comma" | "point",
      csvDelimiter: String(formData.get("csvDelimiter") ?? "semicolon") as "comma" | "semicolon" | "tab",
    };
  } catch {
    return null;
  }
}

export async function saveImportConfigAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const input = parseImportConfigInput(formData);
  if (!input) return { error: "The configuration could not be read — reload and try again." };
  const rawId = String(formData.get("configId") ?? "");
  const result = await batchApi.saveImportConfig(actor, rawId === "" ? null : rawId, input);
  if (result.status === "error") return { error: result.message };
  revalidatePath("/batches/import-configs");
  return { success: true };
}

export async function setImportConfigStatusAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const result = await batchApi.setImportConfigStatus(
    actor,
    String(formData.get("configId") ?? ""),
    formData.get("status") === "active" ? "active" : "inactive",
    String(formData.get("reason") ?? ""),
  );
  if (result.status === "error") return { error: result.message };
  revalidatePath("/batches/import-configs");
  return { success: true };
}

export async function previewImportAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the export file." };
  if (file.size > 5 * 1024 * 1024) return { error: "Import files are limited to 5 MB in the mock." };
  const result = await batchApi.previewImport(actor, batchId, String(formData.get("configId") ?? ""), {
    fileName: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (result.status === "error") return { error: result.message };
  return { preview: result.preview };
}

export async function confirmImportAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  let resolutions: ImportResolution[];
  let replaceCells: { rowNumber: number; analyteName: string }[];
  try {
    resolutions = (JSON.parse(String(formData.get("resolutionsJson") ?? "[]")) as unknown[]).map((r) => {
      const item = r as { rowNumber?: unknown; action?: unknown; reason?: unknown; target?: { targetType?: unknown; targetId?: unknown } };
      return item.action === "map"
        ? {
            rowNumber: Number(item.rowNumber),
            action: "map" as const,
            target: {
              targetType: item.target?.targetType === "qc" ? ("qc" as const) : ("sample" as const),
              targetId: String(item.target?.targetId ?? ""),
            },
          }
        : { rowNumber: Number(item.rowNumber), action: "skip" as const, reason: String(item.reason ?? "") };
    });
    replaceCells = (JSON.parse(String(formData.get("replaceCellsJson") ?? "[]")) as unknown[]).map((c) => {
      const item = c as { rowNumber?: unknown; analyteName?: unknown };
      return { rowNumber: Number(item.rowNumber), analyteName: String(item.analyteName ?? "") };
    });
  } catch {
    return { error: "The confirmation payload could not be read — run the preview again." };
  }
  const result = await batchApi.confirmImport(
    actor,
    batchId,
    String(formData.get("token") ?? ""),
    resolutions,
    replaceCells,
    formData.get("replaceAll") === "true",
    String(formData.get("supersedeReason") ?? ""),
  );
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/batches/${batchId}`);
  return { success: true };
}

export async function setValidityAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  const result = await batchApi.setResultValidity(
    actor,
    batchId,
    String(formData.get("recordId") ?? ""),
    formData.get("validity") === "valid" ? "valid" : "rejected",
    String(formData.get("reason") ?? ""),
  );
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/batches/${batchId}`);
  return { success: true };
}

export async function validateAllAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  const result = await batchApi.validateAllUnflagged(actor, batchId);
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/batches/${batchId}`);
  return { success: true };
}

export async function closeGapAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  const result = await batchApi.closeGapNoResult(
    actor,
    batchId,
    {
      targetType: formData.get("targetType") === "qc" ? "qc" : "sample",
      targetId: String(formData.get("targetId") ?? ""),
    },
    String(formData.get("analyteId") ?? ""),
    String(formData.get("reason") ?? ""),
  );
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/batches/${batchId}`);
  return { success: true };
}

export async function completeBatchAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  const result = await batchApi.completeBatch(actor, batchId);
  if (result.status === "error") return { error: result.message };
  revalidatePath("/batches");
  revalidatePath(`/batches/${batchId}`);
  revalidatePath("/jobs"); // completion cascades through the derived statuses
  return { success: true };
}

export async function replaceResultAction(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const actor = await resolveBatchActor();
  const batchId = String(formData.get("batchId") ?? "");
  const result = await batchApi.replaceCompletedResult(
    actor,
    batchId,
    {
      targetType: formData.get("targetType") === "qc" ? "qc" : "sample",
      targetId: String(formData.get("targetId") ?? ""),
    },
    String(formData.get("analyteId") ?? ""),
    parseResultValueInput(formData),
    String(formData.get("replaceReason") ?? ""),
    // The record the dialog showed as "Current" — overlapping replacements
    // refuse instead of silently chaining onto each other (pass-3 fix).
    String(formData.get("expectedCurrentRecordId") ?? ""),
  );
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

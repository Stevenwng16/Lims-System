"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { qcApi, type QcActor, type QcMaterialInput } from "@/lib/qc";
import type { QcExpectedValue, QcType } from "@/lib/mock-db";
import { resolveOrgContext } from "@/lib/auth/context";

// Submitted text fields echoed back on error so React 19 doesn't wipe them when
// the form action returns (audit finding 10). Controlled fields (type, lab,
// analyte rows, status) survive on their own.
export type QcEchoValues = {
  name: string;
  code: string;
  supplier: string;
  lotNumber: string;
  expiryDate: string;
  description: string;
  statusReason: string;
};

export type QcFormState = { error?: string; success?: boolean; values?: QcEchoValues };

function echo(formData: FormData): QcEchoValues {
  return {
    name: String(formData.get("name") ?? ""),
    code: String(formData.get("code") ?? ""),
    supplier: String(formData.get("supplier") ?? ""),
    lotNumber: String(formData.get("lotNumber") ?? ""),
    expiryDate: String(formData.get("expiryDate") ?? ""),
    description: String(formData.get("description") ?? ""),
    statusReason: String(formData.get("statusReason") ?? ""),
  };
}

// All org roles may view QC materials; the mock API gates managing to Admin /
// Lab manager within their labs (invariant 4). Live-validated via the shared
// resolver.
export async function resolveQcActor(): Promise<QcActor> {
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

function parseInput(formData: FormData): QcMaterialInput | { parseError: string } {
  try {
    const expectedValues = JSON.parse(
      String(formData.get("expectedValuesJson") ?? "[]"),
    ) as QcExpectedValue[];
    return {
      name: String(formData.get("name") ?? ""),
      code: String(formData.get("code") ?? ""),
      // Blind cast is safe: lib/qc/mock.ts whitelists the type server-side.
      type: String(formData.get("type") ?? "control-standard") as QcType,
      labId: String(formData.get("labId") ?? ""),
      supplier: String(formData.get("supplier") ?? ""),
      lotNumber: String(formData.get("lotNumber") ?? ""),
      expiryDate: String(formData.get("expiryDate") ?? ""),
      description: String(formData.get("description") ?? ""),
      expectedValues: expectedValues.map((ev) => ({
        id: typeof ev.id === "string" && ev.id ? ev.id : crypto.randomUUID(),
        analyteName: String(ev.analyteName ?? ""),
        unit: ev.unit === null ? null : String(ev.unit ?? ""),
        expectedValue: String(ev.expectedValue ?? ""),
        tolerance: {
          // Pass the raw kind through so the server whitelist (lib/qc/mock.ts)
          // rejects a tampered value instead of silently coercing it (finding 13).
          kind: String(ev.tolerance?.kind ?? "") as QcExpectedValue["tolerance"]["kind"],
          value: String(ev.tolerance?.value ?? ""),
        },
      })),
    };
  } catch {
    return { parseError: "The form data could not be read — reload the page and try again." };
  }
}

export async function createQcMaterialAction(
  _prev: QcFormState,
  formData: FormData,
): Promise<QcFormState> {
  const actor = await resolveQcActor();
  const input = parseInput(formData);
  if ("parseError" in input) return { error: input.parseError, values: echo(formData) };

  // Optional certificate at creation (AC 2 — audit finding 2). Pre-check the
  // file BEFORE creating, so a bad file never leaves a half-created state.
  const cert = formData.get("certificate");
  const hasCert = cert instanceof File && cert.size > 0;
  if (hasCert && cert.size > 5 * 1024 * 1024) {
    return { error: "Certificates are limited to 5 MB in the mock.", values: echo(formData) };
  }

  const result = await qcApi.createMaterial(actor, input);
  if (result.status === "error") return { error: result.message, values: echo(formData) };

  if (hasCert && result.materialId) {
    const bytes = new Uint8Array(await cert.arrayBuffer());
    const up = await qcApi.uploadCertificate(actor, result.materialId, { fileName: cert.name, bytes });
    if (up.status === "error") {
      revalidatePath("/quality/qc-materials");
      return {
        error: `The material was created, but the certificate upload failed (${up.message}). Close this dialog and add the certificate via Edit.`,
      };
    }
  }

  revalidatePath("/quality/qc-materials");
  return { success: true };
}

export async function updateQcMaterialAction(
  _prev: QcFormState,
  formData: FormData,
): Promise<QcFormState> {
  const actor = await resolveQcActor();
  const materialId = String(formData.get("materialId") ?? "");
  const input = parseInput(formData);
  if ("parseError" in input) return { error: input.parseError, values: echo(formData) };

  // Validate a status change BEFORE committing field edits, so a rejected
  // status change never half-commits the save (validate-before-mutate).
  const requestedStatus = formData.get("status") === "inactive" ? "inactive" : "active";
  const statusReason = String(formData.get("statusReason") ?? "");
  const guard = await qcApi.checkStatusChange(actor, materialId, requestedStatus, statusReason);
  if (guard.status === "error") return { error: guard.message, values: echo(formData) };

  // The code-clash rule is applied against the status the record will have.
  const result = await qcApi.updateMaterial(actor, materialId, input, requestedStatus);
  if (result.status === "error") return { error: result.message, values: echo(formData) };

  const statusResult = await qcApi.setStatus(actor, materialId, requestedStatus, statusReason);
  if (statusResult.status === "error") return { error: statusResult.message, values: echo(formData) };

  revalidatePath("/quality/qc-materials");
  return { success: true };
}

export async function uploadCertificateAction(
  _prev: QcFormState,
  formData: FormData,
): Promise<QcFormState> {
  const actor = await resolveQcActor();
  const materialId = String(formData.get("materialId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await qcApi.uploadCertificate(actor, materialId, { fileName: file.name, bytes });
  if (result.status === "error") return { error: result.message };
  revalidatePath("/quality/qc-materials");
  return { success: true };
}

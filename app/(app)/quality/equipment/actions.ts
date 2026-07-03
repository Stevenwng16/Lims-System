"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  equipmentApi,
  type CalibrationInput,
  type CheckTypeInput,
  type EquipmentActor,
  type EquipmentInput,
} from "@/lib/equipment";
import { resolveOrgContext } from "@/lib/auth/context";

// Text fields echoed back on error so React 19 doesn't wipe the form when the
// action returns (same pattern as QC materials). Controlled fields survive on
// their own.
export type EquipmentFormState = {
  error?: string;
  success?: boolean;
  values?: Record<string, string>;
};

function echo(formData: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

// All org roles may view equipment; the mock API gates managing to Admin /
// Lab manager and check-logging to Analyst+ within their labs (invariant 4).
export async function resolveEquipmentActor(): Promise<EquipmentActor> {
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

function refresh(equipmentId?: string): void {
  revalidatePath("/quality/equipment");
  if (equipmentId) revalidatePath(`/quality/equipment/${equipmentId}`);
}

const EQUIPMENT_FIELDS = [
  "name",
  "assetId",
  "manufacturer",
  "model",
  "serialNumber",
  "location",
  "description",
];

function parseEquipmentInput(formData: FormData): EquipmentInput {
  return {
    name: String(formData.get("name") ?? ""),
    assetId: String(formData.get("assetId") ?? ""),
    typeId: String(formData.get("typeId") ?? ""),
    labId: String(formData.get("labId") ?? ""),
    manufacturer: String(formData.get("manufacturer") ?? ""),
    model: String(formData.get("model") ?? ""),
    serialNumber: String(formData.get("serialNumber") ?? ""),
    location: String(formData.get("location") ?? ""),
    description: String(formData.get("description") ?? ""),
  };
}

export async function createEquipmentAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const result = await equipmentApi.createEquipment(actor, parseEquipmentInput(formData));
  if (result.status === "error") {
    return { error: result.message, values: echo(formData, EQUIPMENT_FIELDS) };
  }
  refresh();
  return { success: true };
}

export async function updateEquipmentAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const result = await equipmentApi.updateEquipment(actor, equipmentId, parseEquipmentInput(formData));
  if (result.status === "error") {
    return { error: result.message, values: echo(formData, EQUIPMENT_FIELDS) };
  }
  refresh(equipmentId);
  return { success: true };
}

export async function updateCalibrationAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const rawInterval = String(formData.get("intervalMonths") ?? "").trim();
  const input: CalibrationInput = {
    // Number("12.5") stays 12.5 and Number("abc") is NaN — both rejected by
    // the server-side whole-months check, never silently rounded.
    intervalMonths: rawInterval === "" ? null : Number(rawInterval),
    lastDate: String(formData.get("lastDate") ?? "").trim() || null,
    dueDate: String(formData.get("dueDate") ?? "").trim() || null,
  };
  const result = await equipmentApi.updateCalibration(actor, equipmentId, input);
  if (result.status === "error") {
    return { error: result.message, values: echo(formData, ["intervalMonths", "lastDate", "dueDate"]) };
  }
  refresh(equipmentId);
  return { success: true };
}

export async function uploadCertificateAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > 5 * 1024 * 1024) return { error: "Certificates are limited to 5 MB in the mock." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await equipmentApi.uploadCertificate(actor, equipmentId, {
    fileName: file.name,
    bytes,
  });
  if (result.status === "error") return { error: result.message };
  refresh(equipmentId);
  return { success: true };
}

const CHECK_TYPE_FIELDS = ["ctName", "expectedValue", "unit", "toleranceValue", "criterionDescription"];

function parseCheckTypeInput(formData: FormData): CheckTypeInput {
  const kind = formData.get("criterionKind") === "manual" ? "manual" : "numeric";
  return {
    name: String(formData.get("ctName") ?? ""),
    // Blind cast is safe: lib/equipment/mock.ts whitelists the frequency.
    frequency: String(formData.get("frequency") ?? "daily") as CheckTypeInput["frequency"],
    criterion:
      kind === "manual"
        ? { kind: "manual", description: String(formData.get("criterionDescription") ?? "") }
        : {
            kind: "numeric",
            expectedValue: String(formData.get("expectedValue") ?? ""),
            unit: formData.get("noUnit") === "on" ? null : String(formData.get("unit") ?? ""),
            tolerance: {
              // Raw value through — the server whitelist rejects tampering.
              kind: String(formData.get("toleranceKind") ?? "") as "absolute" | "percent",
              value: String(formData.get("toleranceValue") ?? ""),
            },
          },
  };
}

export async function addCheckTypeAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const result = await equipmentApi.addCheckType(actor, equipmentId, parseCheckTypeInput(formData));
  if (result.status === "error") {
    return { error: result.message, values: echo(formData, CHECK_TYPE_FIELDS) };
  }
  refresh(equipmentId);
  return { success: true };
}

export async function updateCheckTypeAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const checkTypeId = String(formData.get("checkTypeId") ?? "");
  const result = await equipmentApi.updateCheckType(
    actor,
    equipmentId,
    checkTypeId,
    parseCheckTypeInput(formData),
  );
  if (result.status === "error") {
    return { error: result.message, values: echo(formData, CHECK_TYPE_FIELDS) };
  }
  refresh(equipmentId);
  return { success: true };
}

export async function setCheckTypeStatusAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const result = await equipmentApi.setCheckTypeStatus(
    actor,
    equipmentId,
    String(formData.get("checkTypeId") ?? ""),
    formData.get("status") === "active" ? "active" : "inactive",
    String(formData.get("reason") ?? ""),
  );
  if (result.status === "error") return { error: result.message, values: echo(formData, ["reason"]) };
  refresh(equipmentId);
  return { success: true };
}

export async function logCheckAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const rawResult = String(formData.get("result") ?? "");
  const result = await equipmentApi.logCheck(actor, equipmentId, {
    checkTypeId: String(formData.get("checkTypeId") ?? ""),
    measuredValue: String(formData.get("measuredValue") ?? ""),
    result: rawResult === "pass" || rawResult === "fail" ? rawResult : "",
    notes: String(formData.get("notes") ?? ""),
  });
  if (result.status === "error") {
    return { error: result.message, values: echo(formData, ["measuredValue", "notes"]) };
  }
  refresh(equipmentId);
  return { success: true };
}

export async function saveLinksAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const equipmentId = String(formData.get("equipmentId") ?? "");
  let links: { methodId: string; stepId: string | null }[];
  try {
    const parsed = JSON.parse(String(formData.get("linksJson") ?? "[]")) as unknown[];
    links = parsed.map((l) => {
      const item = l as { methodId?: unknown; stepId?: unknown };
      return {
        methodId: String(item.methodId ?? ""),
        stepId: item.stepId === null || item.stepId === undefined ? null : String(item.stepId),
      };
    });
  } catch {
    return { error: "The link selection could not be read — reload the page and try again." };
  }
  const result = await equipmentApi.setMethodLinks(actor, equipmentId, links);
  if (result.status === "error") return { error: result.message };
  refresh(equipmentId);
  return { success: true };
}

export async function outOfServiceAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const result = await equipmentApi.setOutOfService(
    actor,
    equipmentId,
    String(formData.get("reason") ?? ""),
  );
  if (result.status === "error") return { error: result.message, values: echo(formData, ["reason"]) };
  refresh(equipmentId);
  return { success: true };
}

export async function returnToServiceAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const result = await equipmentApi.returnToService(
    actor,
    equipmentId,
    String(formData.get("note") ?? ""),
  );
  if (result.status === "error") return { error: result.message, values: echo(formData, ["note"]) };
  refresh(equipmentId);
  return { success: true };
}

export async function setEquipmentStatusAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const result = await equipmentApi.setStatus(
    actor,
    equipmentId,
    formData.get("status") === "active" ? "active" : "inactive",
    String(formData.get("reason") ?? ""),
  );
  if (result.status === "error") return { error: result.message, values: echo(formData, ["reason"]) };
  refresh(equipmentId);
  return { success: true };
}

export async function createTypeAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const result = await equipmentApi.createType(actor, String(formData.get("name") ?? ""));
  if (result.status === "error") return { error: result.message, values: echo(formData, ["name"]) };
  refresh();
  return { success: true };
}

export async function renameTypeAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const result = await equipmentApi.renameType(
    actor,
    String(formData.get("typeId") ?? ""),
    String(formData.get("name") ?? ""),
  );
  if (result.status === "error") return { error: result.message };
  refresh();
  return { success: true };
}

export async function setTypeStatusAction(
  _prev: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const actor = await resolveEquipmentActor();
  const result = await equipmentApi.setTypeStatus(
    actor,
    String(formData.get("typeId") ?? ""),
    formData.get("status") === "active" ? "active" : "inactive",
    String(formData.get("reason") ?? ""),
  );
  if (result.status === "error") return { error: result.message };
  refresh();
  return { success: true };
}

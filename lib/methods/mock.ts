import { createHash } from "node:crypto";
import {
  currentMethodVersion,
  mockDb,
  type MethodVersion,
  type MockMethod,
} from "@/lib/mock-db";
import type {
  MethodActionResult,
  MethodActor,
  MethodApi,
  MethodInput,
  MethodListItem,
} from "./types";

function labNameById(labId: string): string {
  return mockDb.labs.get(labId)?.name ?? labId;
}

function orgMethods(orgId: string): MockMethod[] {
  return [...mockDb.methods.values()].filter((m) => m.orgId === orgId);
}

function canView(actor: MethodActor, method: MockMethod): boolean {
  if (actor.role === "admin") return true;
  // Lab scope (US-A4 AC 7): everyone else sees their own lab(s) only.
  return actor.labs.includes(labNameById(currentMethodVersion(method).labId));
}

function canManage(actor: MethodActor, labId: string): string | null {
  if (actor.role === "admin") return null;
  if (actor.role === "lab-manager") {
    return actor.labs.includes(labNameById(labId))
      ? null
      : "Lab managers can only manage methods in their own lab(s).";
  }
  return "Only Admins and Lab managers can manage methods.";
}

// AC 11 — invalid methods cannot be saved. LOQ uses a decimal point and full
// precision as entered (ADR-4: no separator guessing, so comma is rejected).
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

function validateInput(
  actor: MethodActor,
  input: MethodInput,
  excludeId?: string,
  priorLabId?: string,
): string | null {
  if (!input.name.trim()) return "Method name is required.";
  if (!input.code.trim()) return "A method code is required.";
  const lab = mockDb.labs.get(input.labId);
  if (!lab || lab.orgId !== actor.orgId) return "Choose the lab this method belongs to.";
  // Inactive labs take no NEW assignments (US-A5 AC 4), but a method already
  // in a since-deactivated lab stays editable in place (audit finding).
  if (lab.status !== "active" && input.labId !== priorLabId) {
    return "Methods cannot be moved to an inactive lab.";
  }
  if (new Set(input.steps.map((s) => s.id)).size !== input.steps.length) {
    return "Duplicate step ids in the submission — reload the page and try again.";
  }
  if (new Set(input.analytes.map((a) => a.id)).size !== input.analytes.length) {
    return "Duplicate analyte ids in the submission — reload the page and try again.";
  }

  const code = input.code.trim().toUpperCase();
  // Unique within the organisation only (AC 2).
  const clash = orgMethods(actor.orgId).some(
    (m) => m.id !== excludeId && currentMethodVersion(m).code.toUpperCase() === code,
  );
  if (clash) return `The code "${code}" is already used by another method in this organisation.`;

  if (input.steps.length < 1) return "A method needs at least one process step.";
  if (input.steps.some((s) => !s.name.trim())) return "Process steps cannot be empty.";
  // Required equipment types (US-B1 AC 8, editable since US-D3 — they drive
  // step-completion gating): every id must be an equipment type of this
  // organisation; NEW references must be to ACTIVE types, while a type a step
  // already holds stays valid (grandfathering, as everywhere).
  const priorSteps = excludeId
    ? currentMethodVersion(mockDb.methods.get(excludeId)!).steps
    : [];
  for (const s of input.steps) {
    const held = new Set(priorSteps.find((p) => p.id === s.id)?.requiredEquipmentTypes ?? []);
    for (const typeId of s.requiredEquipmentTypes) {
      const type = mockDb.equipmentTypes.get(typeId);
      if (!type || type.orgId !== actor.orgId) {
        return `Step "${s.name}": unknown equipment type in the requirement.`;
      }
      if (type.status !== "active" && !held.has(typeId)) {
        return `Step "${s.name}": the equipment type "${type.name}" is inactive — pick an active type.`;
      }
    }
  }
  if (input.analytes.length < 1) return "A method needs at least one analyte.";
  for (const analyte of input.analytes) {
    if (!analyte.name.trim()) return "Analyte names cannot be empty.";
    if (analyte.unit !== null && !analyte.unit.trim()) {
      return `Analyte "${analyte.name}": enter a unit or mark it explicitly as "no unit".`;
    }
    if (!Number.isInteger(analyte.decimals) || analyte.decimals < 0 || analyte.decimals > 6) {
      return `Analyte "${analyte.name}": reporting precision must be 0–6 decimals.`;
    }
    if (analyte.loq !== null && !DECIMAL_PATTERN.test(analyte.loq)) {
      return `Analyte "${analyte.name}": the reporting limit must be a plain decimal number with a point (e.g. 0.010).`;
    }
  }
  if (!Number.isInteger(input.maxSamplesPerBatch) || input.maxSamplesPerBatch < 1) {
    return "Max samples per batch must be at least 1.";
  }
  return null;
}

/** Canonical content projection — compares what a version *prescribes*, not
 * who/when it was created. Used to suppress no-op versions. */
function versionContentKey(v: MethodVersion): string {
  return JSON.stringify([
    v.name,
    v.code,
    v.labId,
    v.description,
    v.accredited,
    v.maxSamplesPerBatch,
    v.steps.map((s) => [s.id, s.name, s.requiredEquipmentTypes, s.inputValidationRule]),
    v.analytes.map((a) => [a.id, a.name, a.unit, a.decimals, a.loq]),
    v.templateVersion,
  ]);
}

function buildVersion(
  actor: MethodActor,
  input: MethodInput,
  version: number,
  previous: MethodVersion | null,
): MethodVersion {
  return {
    version,
    name: input.name.trim(),
    code: input.code.trim().toUpperCase(),
    labId: input.labId,
    description: input.description.trim(),
    accredited: input.accredited,
    maxSamplesPerBatch: input.maxSamplesPerBatch,
    steps: input.steps.map((s) => {
      // requiredEquipmentTypes is EDITED here since US-D3 (validated above);
      // the validation-rule hook stays preserved for surviving steps (AC 4).
      const prevStep = previous?.steps.find((p) => p.id === s.id);
      return {
        id: s.id,
        name: s.name.trim(),
        // Copy, never share, so old versions stay frozen (AC 9 / invariant 3).
        requiredEquipmentTypes: [...new Set(s.requiredEquipmentTypes)],
        inputValidationRule: prevStep?.inputValidationRule ?? null,
      };
    }),
    analytes: input.analytes.map((a) => ({
      ...a,
      name: a.name.trim(),
      unit: a.unit === null ? null : a.unit.trim(),
      loq: a.loq === null || a.loq === "" ? null : a.loq,
    })),
    templateVersion: previous?.templateVersion ?? null,
    createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    createdBy: actor.email,
  };
}

export const mockMethodApi: MethodApi = {
  async listMethods(actor): Promise<MethodListItem[]> {
    return orgMethods(actor.orgId)
      .filter((m) => canView(actor, m))
      .map((m) => {
        const current = currentMethodVersion(m);
        return {
          id: m.id,
          name: current.name,
          code: current.code,
          labId: current.labId,
          labName: labNameById(current.labId),
          stepCount: current.steps.length,
          analyteCount: current.analytes.length,
          accredited: current.accredited,
          status: m.status,
          version: current.version,
          usedByBatches: m.usedByBatches,
          hasTemplate: current.templateVersion !== null,
        };
      });
  },

  async getMethod(actor, methodId) {
    const method = mockDb.methods.get(methodId);
    if (!method || method.orgId !== actor.orgId || !canView(actor, method)) return null;
    return {
      id: method.id,
      status: method.status,
      statusReason: method.statusReason,
      usedByBatches: method.usedByBatches,
      current: currentMethodVersion(method),
      templates: method.templates,
      versionCount: method.versions.length,
    };
  },

  async createMethod(actor, input): Promise<MethodActionResult> {
    const denied = canManage(actor, input.labId);
    if (denied) return { status: "error", message: denied };
    const error = validateInput(actor, input);
    if (error) return { status: "error", message: error };

    const id = `m-${input.code.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${mockDb.methods.size}`;
    mockDb.methods.set(id, {
      id,
      orgId: actor.orgId,
      status: "active",
      usedByBatches: false,
      templates: [],
      versions: [buildVersion(actor, input, 1, null)],
    });
    return { status: "success", methodId: id };
  },

  async updateMethod(actor, methodId, input): Promise<MethodActionResult> {
    const method = mockDb.methods.get(methodId);
    if (!method || method.orgId !== actor.orgId) return { status: "error", message: "Unknown method." };
    const current = currentMethodVersion(method);
    // Managing rights are needed for the lab it is in AND the lab it moves to.
    const denied = canManage(actor, current.labId) ?? canManage(actor, input.labId);
    if (denied) return { status: "error", message: denied };
    const error = validateInput(actor, input, methodId, current.labId);
    if (error) return { status: "error", message: error };

    if (method.usedByBatches) {
      // AC 9: never silently altered — append a new version; batches keep
      // referencing the version they ran under. A save without any actual
      // change creates NO version (no-op resaves must not pollute the
      // controlled version history — audit finding).
      const next = buildVersion(actor, input, current.version + 1, current);
      if (versionContentKey(next) === versionContentKey(current)) {
        return { status: "success", methodId };
      }
      method.versions.push(next);
      return { status: "success", methodId, newVersion: next.version };
    }
    // Unused method: version 1 may still be shaped in place (skip no-ops so
    // createdAt/createdBy aren't churned).
    const replacement = buildVersion(actor, input, current.version, current);
    if (versionContentKey(replacement) !== versionContentKey(current)) {
      method.versions[method.versions.length - 1] = replacement;
    }
    return { status: "success", methodId };
  },

  async setMethodStatus(actor, methodId, status, reason): Promise<MethodActionResult> {
    const method = mockDb.methods.get(methodId);
    if (!method || method.orgId !== actor.orgId) return { status: "error", message: "Unknown method." };
    const denied = canManage(actor, currentMethodVersion(method).labId);
    if (denied) return { status: "error", message: denied };
    if (method.status === status) return { status: "success", methodId };
    // Invariant 2 (decision 4 Jul 2026): status changes carry a reason.
    if (!reason.trim()) {
      return { status: "error", message: "A reason is required to change the method's status." };
    }
    // AC 10/12: never deleted; existing clearance records stay untouched.
    method.status = status;
    method.statusReason = reason.trim();
    return { status: "success", methodId };
  },

  async replaceTemplate(actor, methodId, file): Promise<MethodActionResult> {
    const method = mockDb.methods.get(methodId);
    if (!method || method.orgId !== actor.orgId) return { status: "error", message: "Unknown method." };
    const current = currentMethodVersion(method);
    const denied = canManage(actor, current.labId);
    if (denied) return { status: "error", message: denied };
    if (file.bytes.length === 0) return { status: "error", message: "The uploaded file is empty." };
    if (file.bytes.length > 5 * 1024 * 1024) {
      return { status: "error", message: "Template files are limited to 5 MB in the mock." };
    }

    // ADR-3/ADR-4: immutable new version + checksum over the actual bytes.
    const templateVersion = method.templates.length + 1;
    method.templates.push({
      version: templateVersion,
      fileName: file.fileName,
      sizeBytes: file.bytes.length,
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
      uploadedAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      uploadedBy: actor.email,
      hasResultsSheet: file.hasResultsSheet,
    });

    if (method.usedByBatches) {
      // AC 6 + AC 9: replacing the template on a used method creates a new
      // METHOD version pinning the new template version. Deep-copy the nested
      // arrays so the historical version can never be mutated through shared
      // references (invariant 3 — audit finding).
      method.versions.push({
        ...current,
        steps: current.steps.map((s) => ({
          ...s,
          requiredEquipmentTypes: [...s.requiredEquipmentTypes],
        })),
        analytes: current.analytes.map((a) => ({ ...a })),
        version: current.version + 1,
        templateVersion,
        createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        createdBy: actor.email,
      });
      return { status: "success", methodId, newVersion: current.version + 1 };
    }
    current.templateVersion = templateVersion;
    return { status: "success", methodId };
  },
};

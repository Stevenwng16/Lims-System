import { createHash } from "node:crypto";
import {
  mockDb,
  type MethodVersion,
  type MockQcMaterial,
  type QcType,
} from "@/lib/mock-db";
import type { QcActionResult, QcActor, QcApi, QcListItem, QcMaterialInput } from "./types";

const QC_TYPES: QcType[] = ["blank", "control-standard", "crm"];
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOON_DAYS = 30;

// Dates are pinned to yyyy-mm-dd at the boundary (invariant 4 / ADR-4 spirit:
// never guess an ambiguous format like "05/07/2027"). The UTC round-trip
// rejects rolled-over days that V8's Date would otherwise accept (e.g. 02-30).
function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function todayIso(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400_000).toISOString().slice(0, 10);
}

function labNameById(labId: string): string {
  return mockDb.labs.get(labId)?.name ?? labId;
}

function orgMaterials(orgId: string): MockQcMaterial[] {
  return [...mockDb.qcMaterials.values()].filter((m) => m.orgId === orgId);
}

/** Append one audit event to the material (invariants 1+6 — 17 Jul 2026 gap
 * closure). Same append-only convention as jobs/users/equipment; batches keep
 * their own frozen expectation snapshots regardless (US-B2 AC 7). */
function addQcEvent(material: MockQcMaterial, actorEmail: string, summary: string): void {
  material.events.push({
    id: `qcev-${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    by: actorEmail,
    summary,
  });
}

function canView(actor: QcActor, labId: string): boolean {
  if (actor.role === "admin" || actor.isSupport) return true;
  return actor.labs.includes(labNameById(labId));
}

function canManage(actor: QcActor, labId: string): string | null {
  if (actor.role !== "admin" && actor.role !== "lab-manager") {
    return "Only Admins and Lab managers can manage QC materials.";
  }
  if (actor.role === "admin" || actor.isSupport) return null;
  return actor.labs.includes(labNameById(labId))
    ? null
    : "Lab managers can only manage QC materials in their own lab(s).";
}

// Compare CALENDAR days, not instants: a lot is valid THROUGH its labeled
// expiry day, and the state changes only at a day boundary — never at a
// timezone-skewed midnight-UTC instant (audit findings 4/7). yyyy-mm-dd strings
// compare correctly lexicographically.
export function expiryState(expiryDate: string): "ok" | "soon" | "expired" | "none" {
  const d = expiryDate.trim();
  if (!d || !isValidIsoDate(d)) return "none";
  if (d < todayIso()) return "expired";
  if (d <= todayIso(SOON_DAYS)) return "soon";
  return "ok";
}

/**
 * Validation per AC 2/10. `grandfather` (the existing record) keeps an
 * already-held lab reference editable after lab deactivation, mirroring the
 * methods module.
 */
function validateInput(
  actor: QcActor,
  input: QcMaterialInput,
  excludeId?: string,
  grandfather?: MockQcMaterial,
  targetStatus: "active" | "inactive" = "active",
): string | null {
  if (!input.name.trim()) return "The material name is required.";
  if (!input.code.trim()) return "A short code is required (matched on instrument-import rows).";
  if (!QC_TYPES.includes(input.type)) return "Invalid QC material type.";

  const lab = mockDb.labs.get(input.labId);
  if (!lab || lab.orgId !== actor.orgId) return "Choose the lab this material belongs to.";
  if (lab.status !== "active" && input.labId !== grandfather?.labId) {
    return "QC materials cannot be assigned to an inactive lab.";
  }

  // Code unique per lab among ACTIVE materials, case-insensitive (AC 2). A
  // record being saved as INACTIVE doesn't contend for the code — otherwise a
  // retained old lot (AC 7) sharing the active lot's code could never be edited
  // (audit findings 1/6/8). Renaming an ACTIVE material's code to a clashing
  // one stays blocked; reactivation is separately re-checked in setStatus.
  if (targetStatus === "active") {
    const code = input.code.trim().toUpperCase();
    const clash = orgMaterials(actor.orgId).some(
      (m) =>
        m.id !== excludeId &&
        m.labId === input.labId &&
        m.status === "active" &&
        m.code.toUpperCase() === code,
    );
    if (clash) {
      return `The code "${code}" is already used by another active QC material in this lab.`;
    }
  }

  const isBlank = input.type === "blank";
  if (!isBlank) {
    // Lot + expiry required for Control standards and CRMs (AC 2/10).
    if (!input.lotNumber.trim()) return "A lot number is required for this material type.";
    if (!isValidIsoDate(input.expiryDate.trim())) {
      return "A valid expiry date (yyyy-mm-dd) is required for this material type.";
    }
    if (input.expectedValues.length < 1) {
      return "A Control standard or CRM needs at least one analyte with an expected value.";
    }
  } else {
    if (input.expectedValues.length > 0) {
      return "A Blank has no numeric targets — it is checked against the method's reporting limit.";
    }
    if (input.expiryDate.trim() && !isValidIsoDate(input.expiryDate.trim())) {
      return "The expiry date is not a valid date (yyyy-mm-dd).";
    }
  }

  const seen = new Set<string>();
  const seenIds = new Set<string>();
  for (const ev of input.expectedValues) {
    // Reject duplicate ids from a tampered POST (ev ids need not be globally
    // unique, but must be unique within a material — audit finding 12).
    if (ev.id && seenIds.has(ev.id)) return "Duplicate analyte ids in the submission.";
    if (ev.id) seenIds.add(ev.id);
    if (!ev.analyteName.trim()) return "Analyte names cannot be empty.";
    if (ev.unit !== null && !ev.unit.trim()) {
      return `Analyte "${ev.analyteName}": enter a unit or mark it explicitly as "no unit".`;
    }
    if (!DECIMAL_PATTERN.test(ev.expectedValue)) {
      return `Analyte "${ev.analyteName}": the expected value must be a plain decimal number with a point.`;
    }
    if (!DECIMAL_PATTERN.test(ev.tolerance.value)) {
      return `Analyte "${ev.analyteName}": the tolerance must be a plain decimal number ≥ 0.`;
    }
    if (ev.tolerance.kind !== "absolute" && ev.tolerance.kind !== "percent") {
      return `Analyte "${ev.analyteName}": tolerance must be absolute (±) or a percentage.`;
    }
    const key = `${ev.analyteName.trim().toLowerCase()}|${ev.unit?.trim().toLowerCase() ?? ""}`;
    if (seen.has(key)) return `Analyte "${ev.analyteName}" appears more than once.`;
    seen.add(key);
  }
  return null;
}

function applyInput(material: MockQcMaterial, input: QcMaterialInput) {
  material.name = input.name.trim();
  material.code = input.code.trim().toUpperCase();
  material.type = input.type;
  material.labId = input.labId;
  material.supplier = input.supplier.trim();
  material.lotNumber = input.lotNumber.trim();
  material.expiryDate = input.expiryDate.trim();
  material.description = input.description.trim();
  material.expectedValues = input.expectedValues.map((ev) => ({
    ...ev,
    analyteName: ev.analyteName.trim(),
    unit: ev.unit === null ? null : ev.unit.trim(),
  }));
}

export const mockQcApi: QcApi = {
  async listMaterials(actor): Promise<QcListItem[]> {
    return orgMaterials(actor.orgId)
      .filter((m) => canView(actor, m.labId))
      .map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
        type: m.type,
        labName: labNameById(m.labId),
        lotNumber: m.lotNumber,
        analyteCount: m.expectedValues.length,
        expiryDate: m.expiryDate,
        expiry: expiryState(m.expiryDate),
        status: m.status,
        hasCertificate: m.certificate !== null,
      }));
  },

  async getMaterial(actor, materialId) {
    const m = mockDb.qcMaterials.get(materialId);
    if (!m || m.orgId !== actor.orgId || !canView(actor, m.labId)) return null;
    return m;
  },

  async createMaterial(actor, input): Promise<QcActionResult> {
    const denied = canManage(actor, input.labId);
    if (denied) return { status: "error", message: denied };
    const error = validateInput(actor, input);
    if (error) return { status: "error", message: error };

    const id = `qc-${crypto.randomUUID()}`;
    const material: MockQcMaterial = {
      id,
      orgId: actor.orgId,
      labId: input.labId,
      name: "",
      code: "",
      type: input.type,
      supplier: "",
      lotNumber: "",
      expiryDate: "",
      certificate: null,
      description: "",
      expectedValues: [],
      status: "active",
      createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      events: [],
    };
    applyInput(material, input);
    mockDb.qcMaterials.set(id, material);
    addQcEvent(
      material,
      actor.email,
      `QC material created (name "${material.name}", code ${material.code}, type ${material.type})`,
    );
    return { status: "success", materialId: id };
  },

  async updateMaterial(actor, materialId, input, targetStatus): Promise<QcActionResult> {
    const material = mockDb.qcMaterials.get(materialId);
    if (!material || material.orgId !== actor.orgId) {
      return { status: "error", message: "Unknown QC material." };
    }
    const denied = canManage(actor, material.labId) ?? canManage(actor, input.labId);
    if (denied) return { status: "error", message: denied };
    // The code-clash rule keys off the status the record will HAVE after the
    // save, so a retained inactive lot stays editable (findings 1/6/8).
    const error = validateInput(actor, input, materialId, material, targetStatus);
    if (error) return { status: "error", message: error };
    // Edits are allowed even after batch use (AC 7): the audit records
    // before/after below, and epic D snapshots the values a batch was
    // checked against — historical QC records never change retroactively.
    const changes: string[] = [];
    const diff = (label: string, before: string, after: string) => {
      if (before !== after) changes.push(`${label}: "${before}" → "${after}"`);
    };
    diff("name", material.name, input.name.trim());
    diff("code", material.code, input.code.trim().toUpperCase());
    diff("type", material.type, input.type);
    diff("lab", labNameById(material.labId), labNameById(input.labId));
    diff("supplier", material.supplier, input.supplier.trim());
    diff("lot", material.lotNumber, input.lotNumber.trim());
    diff("expiry", material.expiryDate, input.expiryDate.trim());
    diff("description", material.description, input.description.trim());
    const beforeEv = JSON.stringify(material.expectedValues);
    applyInput(material, input);
    if (JSON.stringify(material.expectedValues) !== beforeEv) {
      changes.push(`expected values changed (${material.expectedValues.length} analyte(s))`);
    }
    if (changes.length > 0) addQcEvent(material, actor.email, `Material edited: ${changes.join("; ")}`);
    return { status: "success", materialId };
  },

  async checkStatusChange(actor, materialId, status, reason): Promise<QcActionResult> {
    const material = mockDb.qcMaterials.get(materialId);
    if (!material || material.orgId !== actor.orgId) {
      return { status: "error", message: "Unknown QC material." };
    }
    const denied = canManage(actor, material.labId);
    if (denied) return { status: "error", message: denied };
    if (material.status === status) return { status: "success" };
    if (!reason.trim()) {
      return { status: "error", message: "A reason is required to change the material's status." };
    }
    // Reactivating: the code must not collide with another active material.
    if (status === "active") {
      const clash = orgMaterials(actor.orgId).some(
        (m) =>
          m.id !== materialId &&
          m.labId === material.labId &&
          m.status === "active" &&
          m.code.toUpperCase() === material.code.toUpperCase(),
      );
      if (clash) {
        return {
          status: "error",
          message: `Another active material in this lab already uses the code "${material.code}".`,
        };
      }
    }
    return { status: "success" };
  },

  async setStatus(actor, materialId, status, reason): Promise<QcActionResult> {
    const guard = await this.checkStatusChange(actor, materialId, status, reason);
    if (guard.status === "error") return guard;
    const material = mockDb.qcMaterials.get(materialId)!;
    if (material.status === status) return { status: "success" };
    material.status = status;
    material.statusReason = reason.trim();
    addQcEvent(
      material,
      actor.email,
      `Material ${status === "inactive" ? "deactivated" : "reactivated"} — ${reason.trim()}`,
    );
    return { status: "success", materialId };
  },

  async uploadCertificate(actor, materialId, file): Promise<QcActionResult> {
    const material = mockDb.qcMaterials.get(materialId);
    if (!material || material.orgId !== actor.orgId) {
      return { status: "error", message: "Unknown QC material." };
    }
    const denied = canManage(actor, material.labId);
    if (denied) return { status: "error", message: denied };
    if (file.bytes.length === 0) return { status: "error", message: "The uploaded file is empty." };
    if (file.bytes.length > 5 * 1024 * 1024) {
      return { status: "error", message: "Certificates are limited to 5 MB in the mock." };
    }
    // ADR-3: immutable + SHA-256 over the real bytes. A replacement overwrites
    // the pointer; the real attachment facility versions it.
    material.certificate = {
      id: `att-cert-${materialId}-${Date.now()}`,
      fileName: file.fileName,
      sizeBytes: file.bytes.length,
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
      uploadedAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      uploadedBy: actor.email,
    };
    addQcEvent(
      material,
      actor.email,
      `Certificate uploaded: ${file.fileName} (sha256 ${material.certificate.sha256.slice(0, 16)}…)`,
    );
    return { status: "success", materialId };
  },
};

/**
 * Design hook for epic D (AC 9): materials offered for a batch — active, not
 * expired, in the batch's lab, and covering ≥1 method analyte. Coverage =
 * analyte name matches case-insensitively AND the unit matches (null unit
 * matches null). Blanks carry no expected values: they are always relevant
 * (their check runs against the method's LOQ per analyte, epic E).
 */
export function qcMaterialsForMethod(
  orgId: string,
  labId: string,
  method: MethodVersion,
): MockQcMaterial[] {
  const methodAnalytes = method.analytes.map((a) => ({
    name: a.name.trim().toLowerCase(),
    unit: a.unit?.trim().toLowerCase() ?? null,
  }));
  return [...mockDb.qcMaterials.values()].filter((m) => {
    if (m.orgId !== orgId || m.labId !== labId) return false;
    if (m.status !== "active") return false;
    if (expiryState(m.expiryDate) === "expired") return false;
    if (m.type === "blank") return true;
    return m.expectedValues.some((ev) =>
      methodAnalytes.some(
        (a) =>
          a.name === ev.analyteName.trim().toLowerCase() &&
          a.unit === (ev.unit?.trim().toLowerCase() ?? null),
      ),
    );
  });
}

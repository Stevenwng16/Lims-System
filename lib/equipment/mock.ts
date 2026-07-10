import { createHash } from "node:crypto";
import {
  currentMethodVersion,
  getOrgSettings,
  mockDb,
  type CheckCriterion,
  type MockCheckEntry,
  type MockCheckType,
  type MockEquipment,
  type MockEquipmentType,
  type EquipmentEventType,
} from "@/lib/mock-db";
import { SIGNED_DECIMAL, UNSIGNED_DECIMAL, withinTolerance } from "./decimal";
import type {
  Availability,
  CalibrationInput,
  CalibrationState,
  CheckTypeInput,
  CheckTypeView,
  ChecksState,
  EquipmentActionResult,
  EquipmentActor,
  EquipmentApi,
  EquipmentDetail,
  EquipmentInput,
  EquipmentListItem,
  LogCheckInput,
  MethodLinkView,
} from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ASSET_ID = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,31}$/;
const FREQUENCIES = ["per-use", "daily", "weekly"] as const;

// Same calendar-day discipline as lib/qc: dates are yyyy-mm-dd strings, pinned
// at the boundary (never a guessed separator, ADR-4), compared lexicographically
// so states flip at day boundaries, not at timezone-skewed instants.
function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function todayIso(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400_000).toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Month arithmetic clamps to the target month's last day (2026-01-31 + 1 month
// = 2026-02-28), matching how calibration stickers are read in practice.
function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

function nowStamp(): string {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function labNameById(labId: string): string {
  return mockDb.labs.get(labId)?.name ?? labId;
}

function orgEquipment(orgId: string): MockEquipment[] {
  return [...mockDb.equipment.values()].filter((e) => e.orgId === orgId);
}

function orgTypes(orgId: string): MockEquipmentType[] {
  return [...mockDb.equipmentTypes.values()].filter((t) => t.orgId === orgId);
}

function warningDays(orgId: string): number {
  return getOrgSettings(orgId).equipment.calibrationWarningDays;
}

function canView(actor: EquipmentActor, labId: string): boolean {
  if (actor.role === "admin" || actor.isSupport) return true;
  return actor.labs.includes(labNameById(labId));
}

function canManage(actor: EquipmentActor, labId: string): string | null {
  if (actor.role !== "admin" && actor.role !== "lab-manager") {
    return "Only Admins and Lab managers can manage equipment.";
  }
  if (actor.role === "admin" || actor.isSupport) return null;
  return actor.labs.includes(labNameById(labId))
    ? null
    : "Lab managers can only manage equipment in their own lab(s).";
}

// Analysts log routine checks for equipment in their lab(s) (authorization
// section); Read-only never writes. Admins are org-wide like everywhere else.
function canLogCheck(actor: EquipmentActor, labId: string): string | null {
  if (actor.role === "read-only") return "Read-only users cannot log checks.";
  if (actor.role === "admin" || actor.isSupport) return null;
  return actor.labs.includes(labNameById(labId))
    ? null
    : "Checks can only be logged for equipment in your own lab(s).";
}

function canManageTypes(actor: EquipmentActor): string | null {
  return actor.role === "admin" ? null : "Only Admins manage the equipment-type list.";
}

function addEvent(
  eq: MockEquipment,
  actor: EquipmentActor,
  type: EquipmentEventType,
  summary: string,
): void {
  eq.events.push({
    id: `eqev-${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    by: actor.email,
    type,
    summary,
  });
}

function lastEntryFor(eq: MockEquipment, checkTypeId: string): MockCheckEntry | null {
  let last: MockCheckEntry | null = null;
  for (const entry of eq.checks) {
    if (entry.checkTypeId !== checkTypeId) continue;
    // >= so equal timestamps resolve to the LATER append: checks[] is
    // append-only in logging order, and a correction logged within the same
    // clock tick as the entry it corrects must still supersede it.
    if (!last || entry.performedAt >= last.performedAt) last = entry;
  }
  return last;
}

function scheduledNextDue(ct: MockCheckType, last: MockCheckEntry | null): string | null {
  if (ct.frequency === "per-use" || !last) return null;
  return addDaysIso(last.performedAt.slice(0, 10), ct.frequency === "daily" ? 1 : 7);
}

export function calibrationState(dueDate: string | null, warnDays: number): CalibrationState {
  if (!dueDate) return "none";
  if (dueDate < todayIso()) return "expired";
  if (dueDate <= todayIso(warnDays)) return "due-soon";
  return "valid";
}

/**
 * The heart of AC 6/7: Available / Due soon / Blocked, derived LIVE from
 * calibration, required checks and the out-of-service flag. Because nothing is
 * stored, resolving a condition (renewed calibration, a new check that passes,
 * return to service) clears it on the next read — and there is nothing a
 * manual "unblock" could ever flip (hard-never list).
 */
export function equipmentAvailability(eq: MockEquipment, warnDays: number): Availability {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  if (eq.outOfService) {
    blockedReasons.push(`Out of service — ${eq.outOfService.reason}`);
  }

  const cal = calibrationState(eq.calibration.dueDate, warnDays);
  if (cal === "expired") blockedReasons.push(`Calibration expired (was due ${eq.calibration.dueDate})`);
  if (cal === "due-soon") warnings.push(`Calibration due ${eq.calibration.dueDate}`);

  for (const ct of eq.checkTypes) {
    if (ct.status !== "active") continue; // retired checks stop being required
    const last = lastEntryFor(eq, ct.id);
    // AC 7: a late check that is performed but FAILS stays Blocked — now for
    // "last check failed"; only a pass restores.
    if (last?.result === "fail") blockedReasons.push(`Last "${ct.name}" failed`);
    if (ct.frequency === "per-use") continue; // gated at the point of use (epic D)
    if (!last) {
      // A scheduled required check with no entry has never proven fitness.
      blockedReasons.push(`Required check "${ct.name}" has never been performed`);
      continue;
    }
    const nextDue = scheduledNextDue(ct, last)!;
    if (nextDue < todayIso()) blockedReasons.push(`"${ct.name}" overdue since ${nextDue}`);
    else if (nextDue === todayIso()) warnings.push(`"${ct.name}" due today`);
  }

  return {
    state: blockedReasons.length ? "blocked" : warnings.length ? "due-soon" : "available",
    blockedReasons,
    warnings,
  };
}

// List-column summary (AC 1/12): the worst state across the active check types.
function checksSummary(eq: MockEquipment): { state: ChecksState; label: string } {
  const active = eq.checkTypes.filter((ct) => ct.status === "active");
  if (active.length === 0) return { state: "none", label: "—" };

  let failed = false;
  let overdue = false;
  let dueToday = false;
  let latestDay: string | null = null;
  for (const ct of active) {
    const last = lastEntryFor(eq, ct.id);
    if (last?.result === "fail") failed = true;
    if (last && (!latestDay || last.performedAt.slice(0, 10) > latestDay)) {
      latestDay = last.performedAt.slice(0, 10);
    }
    if (ct.frequency === "per-use") continue;
    const nextDue = scheduledNextDue(ct, last);
    if (!nextDue || nextDue < todayIso()) overdue = true;
    else if (nextDue === todayIso()) dueToday = true;
  }
  if (failed) return { state: "failed", label: "Failed" };
  if (overdue) return { state: "overdue", label: "Overdue" };
  if (dueToday) return { state: "due-today", label: "Due today" };
  if (!latestDay) return { state: "none", label: "—" };
  return { state: "ok", label: latestDay === todayIso() ? "OK (today)" : `OK (${latestDay})` };
}

function criterionLabel(c: CheckCriterion): string {
  if (c.kind === "manual") return c.description;
  const unit = c.unit ? ` ${c.unit}` : "";
  const tol =
    c.tolerance.kind === "percent" ? `${c.tolerance.value}%` : `${c.tolerance.value}${unit}`;
  return `${c.expectedValue}${unit} ± ${tol}`;
}

function validateEquipmentInput(
  actor: EquipmentActor,
  input: EquipmentInput,
  excludeId?: string,
  grandfather?: MockEquipment,
): string | null {
  if (!input.name.trim()) return "The equipment name is required.";

  const assetId = input.assetId.trim();
  if (!ASSET_ID.test(assetId)) {
    return "The equipment ID must be 2–32 characters (letters, digits, . _ / -).";
  }
  // Unique within the organisation across active AND inactive records (AC
  // 2/13): the ID names a physical asset and is never reissued — a
  // deactivated balance keeps its ID forever.
  const idClash = orgEquipment(actor.orgId).some(
    (e) => e.id !== excludeId && e.assetId.toUpperCase() === assetId.toUpperCase(),
  );
  if (idClash) return `The equipment ID "${assetId}" is already used in this organisation.`;

  const type = mockDb.equipmentTypes.get(input.typeId);
  if (!type || type.orgId !== actor.orgId) return "Choose an equipment type.";
  if (type.status !== "active" && input.typeId !== grandfather?.typeId) {
    return "This equipment type is inactive — pick an active type.";
  }

  const lab = mockDb.labs.get(input.labId);
  if (!lab || lab.orgId !== actor.orgId) return "Choose the lab this equipment belongs to.";
  if (lab.status !== "active" && input.labId !== grandfather?.labId) {
    return "Equipment cannot be assigned to an inactive lab.";
  }
  return null;
}

function applyEquipmentInput(eq: MockEquipment, input: EquipmentInput): void {
  eq.name = input.name.trim();
  eq.assetId = input.assetId.trim();
  eq.typeId = input.typeId;
  eq.labId = input.labId;
  eq.manufacturer = input.manufacturer.trim();
  eq.model = input.model.trim();
  eq.serialNumber = input.serialNumber.trim();
  eq.location = input.location.trim();
  eq.description = input.description.trim();
}

function validateCheckTypeInput(
  eq: MockEquipment,
  input: CheckTypeInput,
  excludeId?: string,
): string | null {
  if (!input.name.trim()) return "The check type needs a name.";
  const name = input.name.trim().toLowerCase();
  const clash = eq.checkTypes.some(
    (ct) => ct.id !== excludeId && ct.status === "active" && ct.name.trim().toLowerCase() === name,
  );
  if (clash) return `An active check type named "${input.name.trim()}" already exists here.`;
  if (!FREQUENCIES.includes(input.frequency)) return "Choose a check frequency.";

  // AC 13: a defined check has a frequency AND an acceptance criterion.
  const c = input.criterion;
  if (c.kind === "numeric") {
    if (!SIGNED_DECIMAL.test(c.expectedValue.trim())) {
      return "The expected value must be a plain decimal number with a point.";
    }
    if (!UNSIGNED_DECIMAL.test(c.tolerance.value.trim())) {
      return "The tolerance must be a plain decimal number ≥ 0.";
    }
    if (c.tolerance.kind !== "absolute" && c.tolerance.kind !== "percent") {
      return "The tolerance must be absolute (±) or a percentage.";
    }
    if (c.unit !== null && !c.unit.trim()) {
      return 'Enter a unit or mark the criterion explicitly as "no unit".';
    }
  } else if (c.kind === "manual") {
    if (!c.description.trim()) {
      return "Describe the acceptance criterion (what makes this check a pass).";
    }
  } else {
    return "Invalid acceptance criterion.";
  }
  return null;
}

function normalizedCriterion(c: CheckTypeInput["criterion"]): CheckCriterion {
  if (c.kind === "manual") return { kind: "manual", description: c.description.trim() };
  return {
    kind: "numeric",
    expectedValue: c.expectedValue.trim(),
    unit: c.unit === null ? null : c.unit.trim(),
    tolerance: { kind: c.tolerance.kind, value: c.tolerance.value.trim() },
  };
}

function getOwned(
  actor: EquipmentActor,
  equipmentId: string,
): MockEquipment | null {
  const eq = mockDb.equipment.get(equipmentId);
  if (!eq || eq.orgId !== actor.orgId) return null;
  return eq;
}

export const mockEquipmentApi: EquipmentApi = {
  async listEquipment(actor): Promise<EquipmentListItem[]> {
    const warnDays = warningDays(actor.orgId);
    return orgEquipment(actor.orgId)
      .filter((eq) => canView(actor, eq.labId))
      .sort((a, b) => a.name.localeCompare(b.name) || a.assetId.localeCompare(b.assetId))
      .map((eq) => ({
        id: eq.id,
        name: eq.name,
        assetId: eq.assetId,
        typeName: mockDb.equipmentTypes.get(eq.typeId)?.name ?? eq.typeId,
        labName: labNameById(eq.labId),
        calibration: {
          state: calibrationState(eq.calibration.dueDate, warnDays),
          dueDate: eq.calibration.dueDate,
        },
        checks: checksSummary(eq),
        availability: equipmentAvailability(eq, warnDays),
        status: eq.status,
      }));
  },

  async getEquipment(actor, equipmentId): Promise<EquipmentDetail | null> {
    const eq = getOwned(actor, equipmentId);
    if (!eq || !canView(actor, eq.labId)) return null;
    const warnDays = warningDays(actor.orgId);
    const type = mockDb.equipmentTypes.get(eq.typeId);

    const checkTypes: CheckTypeView[] = eq.checkTypes.map((ct) => {
      const lastEntry = lastEntryFor(eq, ct.id);
      return { ...ct, lastEntry, nextDue: ct.status === "active" ? scheduledNextDue(ct, lastEntry) : null };
    });

    const links: MethodLinkView[] = eq.methodLinks.map((link) => {
      const method = mockDb.methods.get(link.methodId);
      const current = method ? currentMethodVersion(method) : null;
      return {
        methodId: link.methodId,
        stepId: link.stepId,
        methodName: current ? `${current.name} (${current.code})` : link.methodId,
        methodStatus: method?.status ?? "inactive",
        stepName: link.stepId
          ? (current?.steps.find((s) => s.id === link.stepId)?.name ?? null)
          : null,
        // A held link whose method (or this equipment) moved lab is stale for
        // gating — the read-only Methods tab must show that, not just the
        // manager's edit dialog (review fix, pass 2).
        sameLab: current !== null && current.labId === eq.labId,
      };
    });

    return {
      record: eq,
      typeName: type?.name ?? eq.typeId,
      typeStatus: type?.status ?? "inactive",
      labName: labNameById(eq.labId),
      availability: equipmentAvailability(eq, warnDays),
      calibrationState: calibrationState(eq.calibration.dueDate, warnDays),
      checkTypes,
      links,
      warningDays: warnDays,
    };
  },

  async createEquipment(actor, input): Promise<EquipmentActionResult> {
    const denied = canManage(actor, input.labId);
    if (denied) return { status: "error", message: denied };
    const error = validateEquipmentInput(actor, input);
    if (error) return { status: "error", message: error };

    const id = `eq-${crypto.randomUUID()}`;
    const eq: MockEquipment = {
      id,
      orgId: actor.orgId,
      labId: input.labId,
      name: "",
      assetId: "",
      typeId: input.typeId,
      manufacturer: "",
      model: "",
      serialNumber: "",
      location: "",
      description: "",
      calibration: {
        intervalMonths: null,
        lastDate: null,
        dueDate: null,
        dueDateManual: false,
        certificate: null,
      },
      checkTypes: [],
      checks: [],
      methodLinks: [],
      outOfService: null,
      status: "active",
      events: [],
      createdAt: nowStamp(),
    };
    applyEquipmentInput(eq, input);
    mockDb.equipment.set(id, eq);
    addEvent(eq, actor, "created", `Equipment created (${eq.assetId})`);
    return { status: "success", equipmentId: id };
  },

  async updateEquipment(actor, equipmentId, input): Promise<EquipmentActionResult> {
    const eq = getOwned(actor, equipmentId);
    if (!eq) return { status: "error", message: "Unknown equipment." };
    const denied = canManage(actor, eq.labId) ?? canManage(actor, input.labId);
    if (denied) return { status: "error", message: denied };
    // The asset ID is IMMUTABLE once issued: it names a physical asset and is
    // never changed or reissued (decision 3 Jul 2026). An editable ID would
    // let a rename free the old tag for a different asset — the exact reissue
    // the cross-active-and-inactive uniqueness rule exists to prevent
    // (review fix, pass 2). A genuinely mistyped tag means deactivate + create.
    if (input.assetId.trim() !== eq.assetId) {
      return {
        status: "error",
        message:
          "The equipment ID is fixed once created — it names the physical asset and is never changed or reissued. For a wrong tag: deactivate this record and create a new one.",
      };
    }
    const error = validateEquipmentInput(actor, input, equipmentId, eq);
    if (error) return { status: "error", message: error };

    // Before/after per changed field (AC 14) — names resolved for readability.
    // The asset ID is not tracked: the guard above makes it unchangeable.
    const changes: string[] = [];
    const track = (label: string, before: string, after: string) => {
      if (before !== after) changes.push(`${label}: "${before}" → "${after}"`);
    };
    track("name", eq.name, input.name.trim());
    track(
      "type",
      mockDb.equipmentTypes.get(eq.typeId)?.name ?? eq.typeId,
      mockDb.equipmentTypes.get(input.typeId)?.name ?? input.typeId,
    );
    track("lab", labNameById(eq.labId), labNameById(input.labId));
    track("manufacturer", eq.manufacturer, input.manufacturer.trim());
    track("model", eq.model, input.model.trim());
    track("serial", eq.serialNumber, input.serialNumber.trim());
    track("location", eq.location, input.location.trim());
    track("description", eq.description, input.description.trim());

    applyEquipmentInput(eq, input);
    if (changes.length > 0) addEvent(eq, actor, "edited", changes.join("; "));
    return { status: "success", equipmentId };
  },

  async updateCalibration(actor, equipmentId, input): Promise<EquipmentActionResult> {
    const eq = getOwned(actor, equipmentId);
    if (!eq) return { status: "error", message: "Unknown equipment." };
    const denied = canManage(actor, eq.labId);
    if (denied) return { status: "error", message: denied };

    if (input.intervalMonths !== null) {
      if (!Number.isInteger(input.intervalMonths) || input.intervalMonths < 1 || input.intervalMonths > 120) {
        return { status: "error", message: "The calibration interval must be 1–120 whole months." };
      }
    }
    if (input.lastDate !== null) {
      if (!isValidIsoDate(input.lastDate)) {
        return { status: "error", message: "The last calibration date must be a valid date (yyyy-mm-dd)." };
      }
      if (input.lastDate > todayIso()) {
        return { status: "error", message: "The last calibration date cannot be in the future." };
      }
    }
    if (input.dueDate !== null && !isValidIsoDate(input.dueDate)) {
      return { status: "error", message: "The due date must be a valid date (yyyy-mm-dd)." };
    }
    if (input.dueDate !== null && input.lastDate !== null && input.dueDate < input.lastDate) {
      return { status: "error", message: "The due date cannot be before the last calibration date." };
    }

    // Due date: manual override wins; otherwise derived from last + interval (AC 3).
    const derived =
      input.dueDate ??
      (input.lastDate !== null && input.intervalMonths !== null
        ? addMonthsClamped(input.lastDate, input.intervalMonths)
        : null);

    // Once calibration is tracked it cannot be UN-tracked: clearing the due
    // date would silently lift an expiry block — recovery is a renewed
    // calibration, never removal of the requirement (AC 7 spirit).
    if (eq.calibration.dueDate !== null && derived === null) {
      return {
        status: "error",
        message:
          "Calibration tracking cannot be removed once recorded — enter the renewed calibration instead.",
      };
    }

    const before = eq.calibration;
    const summary = [
      before.intervalMonths !== input.intervalMonths
        ? `interval: ${before.intervalMonths ?? "—"} → ${input.intervalMonths ?? "—"} months`
        : null,
      before.lastDate !== input.lastDate ? `last: ${before.lastDate ?? "—"} → ${input.lastDate ?? "—"}` : null,
      before.dueDate !== derived
        ? `due: ${before.dueDate ?? "—"} → ${derived ?? "—"}${input.dueDate !== null ? " (set manually)" : ""}`
        : null,
    ].filter(Boolean);

    eq.calibration = {
      intervalMonths: input.intervalMonths,
      lastDate: input.lastDate,
      dueDate: derived,
      dueDateManual: input.dueDate !== null,
      certificate: before.certificate,
    };
    if (summary.length > 0) addEvent(eq, actor, "calibration-updated", summary.join("; "));
    return { status: "success", equipmentId };
  },

  async uploadCertificate(actor, equipmentId, file): Promise<EquipmentActionResult> {
    const eq = getOwned(actor, equipmentId);
    if (!eq) return { status: "error", message: "Unknown equipment." };
    const denied = canManage(actor, eq.labId);
    if (denied) return { status: "error", message: denied };
    if (file.bytes.length === 0) return { status: "error", message: "The uploaded file is empty." };
    if (file.bytes.length > 5 * 1024 * 1024) {
      return { status: "error", message: "Certificates are limited to 5 MB in the mock." };
    }
    // ADR-3: immutable + SHA-256 over the real bytes. A replacement overwrites
    // the pointer; the real attachment facility versions it.
    const sha256 = createHash("sha256").update(file.bytes).digest("hex");
    eq.calibration.certificate = {
      id: `att-cal-${equipmentId}-${Date.now()}`,
      fileName: file.fileName,
      sizeBytes: file.bytes.length,
      sha256,
      uploadedAt: nowStamp(),
      uploadedBy: actor.email,
    };
    addEvent(eq, actor, "certificate-uploaded", `Calibration certificate: ${file.fileName} (sha256 ${sha256.slice(0, 16)}…)`);
    return { status: "success", equipmentId };
  },

  async addCheckType(actor, equipmentId, input): Promise<EquipmentActionResult> {
    const eq = getOwned(actor, equipmentId);
    if (!eq) return { status: "error", message: "Unknown equipment." };
    const denied = canManage(actor, eq.labId);
    if (denied) return { status: "error", message: denied };
    const error = validateCheckTypeInput(eq, input);
    if (error) return { status: "error", message: error };

    const ct: MockCheckType = {
      id: `ct-${crypto.randomUUID()}`,
      name: input.name.trim(),
      frequency: input.frequency,
      criterion: normalizedCriterion(input.criterion),
      status: "active",
    };
    eq.checkTypes.push(ct);
    addEvent(eq, actor, "check-type-added", `${ct.name} (${ct.frequency}) — criterion: ${criterionLabel(ct.criterion)}`);
    return { status: "success", equipmentId };
  },

  async updateCheckType(actor, equipmentId, checkTypeId, input): Promise<EquipmentActionResult> {
    const eq = getOwned(actor, equipmentId);
    if (!eq) return { status: "error", message: "Unknown equipment." };
    const denied = canManage(actor, eq.labId);
    if (denied) return { status: "error", message: denied };
    const ct = eq.checkTypes.find((c) => c.id === checkTypeId);
    if (!ct) return { status: "error", message: "Unknown check type." };
    const error = validateCheckTypeInput(eq, input, checkTypeId);
    if (error) return { status: "error", message: error };

    // Past entries are untouched: each stores the result it was computed with
    // at logging time, so tightening a tolerance never rewrites history.
    const beforeLabel = `${ct.name} (${ct.frequency}) — ${criterionLabel(ct.criterion)}`;
    ct.name = input.name.trim();
    ct.frequency = input.frequency;
    ct.criterion = normalizedCriterion(input.criterion);
    const afterLabel = `${ct.name} (${ct.frequency}) — ${criterionLabel(ct.criterion)}`;
    if (beforeLabel !== afterLabel) {
      addEvent(eq, actor, "check-type-changed", `${beforeLabel} → ${afterLabel}`);
    }
    return { status: "success", equipmentId };
  },

  async setCheckTypeStatus(actor, equipmentId, checkTypeId, status, reason): Promise<EquipmentActionResult> {
    const eq = getOwned(actor, equipmentId);
    if (!eq) return { status: "error", message: "Unknown equipment." };
    const denied = canManage(actor, eq.labId);
    if (denied) return { status: "error", message: denied };
    const ct = eq.checkTypes.find((c) => c.id === checkTypeId);
    if (!ct) return { status: "error", message: "Unknown check type." };
    if (ct.status === status) return { status: "success" };
    if (!reason.trim()) {
      return { status: "error", message: "A reason is required to change the check type's status." };
    }
    if (status === "active") {
      const clash = eq.checkTypes.some(
        (c) => c.id !== checkTypeId && c.status === "active" &&
          c.name.trim().toLowerCase() === ct.name.trim().toLowerCase(),
      );
      if (clash) {
        return { status: "error", message: `An active check type named "${ct.name}" already exists here.` };
      }
    }
    ct.status = status;
    ct.statusReason = reason.trim();
    addEvent(
      eq,
      actor,
      "check-type-changed",
      `${ct.name}: ${status === "inactive" ? "retired" : "reactivated"} — ${reason.trim()}`,
    );
    return { status: "success", equipmentId };
  },

  async logCheck(actor, equipmentId, input): Promise<EquipmentActionResult> {
    const eq = getOwned(actor, equipmentId);
    if (!eq) return { status: "error", message: "Unknown equipment." };
    const denied = canLogCheck(actor, eq.labId);
    if (denied) return { status: "error", message: denied };
    if (eq.status !== "active") {
      return { status: "error", message: "Inactive equipment cannot receive new checks — reactivate it first." };
    }
    const ct = eq.checkTypes.find((c) => c.id === input.checkTypeId);
    if (!ct) return { status: "error", message: "Unknown check type." };
    if (ct.status !== "active") {
      return { status: "error", message: "This check type has been retired — checks can no longer be logged against it." };
    }

    const measured = input.measuredValue.trim();
    let result: "pass" | "fail";
    let resultComputed: boolean;
    if (ct.criterion.kind === "numeric") {
      // AC 5 (Fable review amendment): the system computes pass/fail — the
      // measured value is REQUIRED, and any submitted manual choice is
      // ignored, so an out-of-tolerance value can never be declared a pass.
      // A typo is corrected with a NEW entry, never an overwrite.
      if (!measured) {
        return { status: "error", message: "This check has a numeric criterion — enter the measured value; pass/fail is computed." };
      }
      if (!SIGNED_DECIMAL.test(measured)) {
        return { status: "error", message: "The measured value must be a plain decimal number with a point (e.g. 100.001)." };
      }
      const within = withinTolerance(measured, ct.criterion.expectedValue, ct.criterion.tolerance);
      if (within === null) {
        return { status: "error", message: "The acceptance criterion could not be evaluated — check the check type's configuration." };
      }
      result = within ? "pass" : "fail";
      resultComputed = true;
    } else {
      if (input.result !== "pass" && input.result !== "fail") {
        return { status: "error", message: "Choose pass or fail." };
      }
      if (measured && !SIGNED_DECIMAL.test(measured)) {
        return { status: "error", message: "The measured value must be a plain decimal number with a point." };
      }
      result = input.result;
      resultComputed = false;
    }

    const entry: MockCheckEntry = {
      id: `chk-${crypto.randomUUID()}`,
      checkTypeId: ct.id,
      performedAt: new Date().toISOString(), // server clock; performer = session user (invariant 6)
      performedBy: actor.email,
      measuredValue: measured || null,
      result,
      resultComputed,
      notes: input.notes.trim(),
    };
    eq.checks.push(entry); // append-only — nothing is ever updated or removed
    addEvent(
      eq,
      actor,
      "check-logged",
      `${ct.name}: ${result}${measured ? ` (measured ${measured})` : ""}${resultComputed ? " — computed" : ""}`,
    );
    return { status: "success", equipmentId };
  },

  async setMethodLinks(actor, equipmentId, links): Promise<EquipmentActionResult> {
    const eq = getOwned(actor, equipmentId);
    if (!eq) return { status: "error", message: "Unknown equipment." };
    const denied = canManage(actor, eq.labId);
    if (denied) return { status: "error", message: denied };

    // Dedupe, then validate NEW links only — links held from before a method's
    // deactivation or a lab move are grandfathered, consistent with methods/QC.
    const seen = new Set<string>();
    const next: { methodId: string; stepId: string | null }[] = [];
    const existing = new Set(eq.methodLinks.map((l) => `${l.methodId}|${l.stepId ?? ""}`));
    for (const link of links) {
      const key = `${link.methodId}|${link.stepId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const method = mockDb.methods.get(link.methodId);
      if (!method || method.orgId !== actor.orgId) {
        return { status: "error", message: "Unknown method in the link selection." };
      }
      if (!existing.has(key)) {
        const current = currentMethodVersion(method);
        if (method.status !== "active") {
          return { status: "error", message: `"${current.name}" is inactive — links can only be added to active methods.` };
        }
        if (current.labId !== eq.labId) {
          return { status: "error", message: `"${current.name}" belongs to another lab than this equipment.` };
        }
        if (link.stepId !== null && !current.steps.some((s) => s.id === link.stepId)) {
          return { status: "error", message: `"${current.name}" has no such process step (the method may have changed — reload).` };
        }
      }
      next.push({ methodId: link.methodId, stepId: link.stepId });
    }

    const label = (l: { methodId: string; stepId: string | null }): string => {
      const method = mockDb.methods.get(l.methodId);
      const current = method ? currentMethodVersion(method) : null;
      const step = l.stepId ? current?.steps.find((s) => s.id === l.stepId)?.name ?? l.stepId : null;
      return `${current?.name ?? l.methodId}${step ? ` → ${step}` : ""}`;
    };
    const nextKeys = new Set(next.map((l) => `${l.methodId}|${l.stepId ?? ""}`));
    const added = next.filter((l) => !existing.has(`${l.methodId}|${l.stepId ?? ""}`));
    const removed = eq.methodLinks.filter((l) => !nextKeys.has(`${l.methodId}|${l.stepId ?? ""}`));

    eq.methodLinks = next;
    if (added.length || removed.length) {
      const parts = [
        added.length ? `linked: ${added.map(label).join(", ")}` : null,
        removed.length ? `unlinked: ${removed.map(label).join(", ")}` : null,
      ].filter(Boolean);
      addEvent(eq, actor, "links-changed", parts.join("; "));
    }
    return { status: "success", equipmentId };
  },

  async setOutOfService(actor, equipmentId, reason): Promise<EquipmentActionResult> {
    const eq = getOwned(actor, equipmentId);
    if (!eq) return { status: "error", message: "Unknown equipment." };
    const denied = canManage(actor, eq.labId);
    if (denied) return { status: "error", message: denied };
    if (eq.outOfService) return { status: "error", message: "This equipment is already out of service." };
    if (!reason.trim()) {
      return { status: "error", message: "A reason is required to take equipment out of service." };
    }
    eq.outOfService = { reason: reason.trim(), since: new Date().toISOString(), by: actor.email };
    addEvent(eq, actor, "out-of-service", `Taken out of service: ${reason.trim()}`);
    return { status: "success", equipmentId };
  },

  async returnToService(actor, equipmentId, note): Promise<EquipmentActionResult> {
    const eq = getOwned(actor, equipmentId);
    if (!eq) return { status: "error", message: "Unknown equipment." };
    const denied = canManage(actor, eq.labId);
    if (denied) return { status: "error", message: denied };
    if (!eq.outOfService) return { status: "error", message: "This equipment is not out of service." };
    // AC 8: clearing is EXPLICIT and recorded; the record of having been out
    // of service stays in the append-only events (AC 9).
    eq.outOfService = null;
    addEvent(eq, actor, "returned-to-service", `Returned to service${note.trim() ? `: ${note.trim()}` : ""}`);
    return { status: "success", equipmentId };
  },

  async setStatus(actor, equipmentId, status, reason): Promise<EquipmentActionResult> {
    const eq = getOwned(actor, equipmentId);
    if (!eq) return { status: "error", message: "Unknown equipment." };
    const denied = canManage(actor, eq.labId);
    if (denied) return { status: "error", message: denied };
    if (eq.status === status) return { status: "success" };
    if (!reason.trim()) {
      return { status: "error", message: "A reason is required to change the equipment's status." };
    }
    eq.status = status;
    eq.statusReason = reason.trim();
    addEvent(eq, actor, "status-changed", `${status === "inactive" ? "active → inactive" : "inactive → active"}: ${reason.trim()}`);
    return { status: "success", equipmentId };
  },

  async listTypes(actor): Promise<MockEquipmentType[]> {
    // Reference data: every org member may read the list (it fills the type
    // dropdown); only Admins may CHANGE it (authorization section).
    return orgTypes(actor.orgId).sort((a, b) => a.name.localeCompare(b.name));
  },

  async createType(actor, name): Promise<EquipmentActionResult> {
    const denied = canManageTypes(actor);
    if (denied) return { status: "error", message: denied };
    const trimmed = name.trim();
    if (!trimmed) return { status: "error", message: "The type name cannot be empty." };
    const clash = orgTypes(actor.orgId).some((t) => t.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (clash) {
      return { status: "error", message: `A type named "${trimmed}" already exists (reactivate it instead of adding a duplicate).` };
    }
    const id = `eqt-${crypto.randomUUID()}`;
    mockDb.equipmentTypes.set(id, { id, orgId: actor.orgId, name: trimmed, status: "active" });
    return { status: "success" };
  },

  async renameType(actor, typeId, name): Promise<EquipmentActionResult> {
    const denied = canManageTypes(actor);
    if (denied) return { status: "error", message: denied };
    const type = mockDb.equipmentTypes.get(typeId);
    if (!type || type.orgId !== actor.orgId) return { status: "error", message: "Unknown equipment type." };
    const trimmed = name.trim();
    if (!trimmed) return { status: "error", message: "The type name cannot be empty." };
    const clash = orgTypes(actor.orgId).some(
      (t) => t.id !== typeId && t.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (clash) return { status: "error", message: `A type named "${trimmed}" already exists.` };
    // Equipment references the type by id, so a rename follows everywhere.
    type.name = trimmed;
    return { status: "success" };
  },

  async setTypeStatus(actor, typeId, status, reason): Promise<EquipmentActionResult> {
    const denied = canManageTypes(actor);
    if (denied) return { status: "error", message: denied };
    const type = mockDb.equipmentTypes.get(typeId);
    if (!type || type.orgId !== actor.orgId) return { status: "error", message: "Unknown equipment type." };
    if (type.status === status) return { status: "success" };
    if (!reason.trim()) {
      return { status: "error", message: "A reason is required to change the type's status." };
    }
    // Deactivate, never delete: existing equipment keeps the type
    // (grandfathered); it just stops being offered for NEW equipment.
    type.status = status;
    type.statusReason = reason.trim();
    return { status: "success" };
  },
};

/**
 * Design hook for epic D (AC 10 / DoD): the equipment a method step depends
 * on, with its LIVE availability — a step requiring a piece of equipment
 * cannot be completed while that equipment is Blocked (enforced in epic D). A
 * method-level link (stepId null) applies to every step of the method.
 * Lab-scoped like the enforced gate (US-D3 AC 4 "from that lab's items"):
 * links stranded by a lab move never feed another lab's gating pool
 * (review fix, pass 2).
 */
export function equipmentForMethodStep(
  orgId: string,
  labId: string,
  methodId: string,
  stepId: string,
): { equipment: MockEquipment; availability: Availability }[] {
  const warnDays = warningDays(orgId);
  return [...mockDb.equipment.values()]
    .filter(
      (eq) =>
        eq.orgId === orgId &&
        eq.labId === labId &&
        eq.status === "active" &&
        eq.methodLinks.some((l) => l.methodId === methodId && (l.stepId === null || l.stepId === stepId)),
    )
    .map((eq) => ({ equipment: eq, availability: equipmentAvailability(eq, warnDays) }));
}

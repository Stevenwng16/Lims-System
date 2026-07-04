import { createHash } from "node:crypto";
import {
  currentMethodVersion,
  getOrgSettings,
  mockDb,
  type ImportCellOutcome,
  type ImportRowOutcome,
  type MethodStep,
  type MethodVersion,
  type MockBatch,
  type MockBatchEvent,
  type MockImportConfig,
  type MockImportEvent,
  type MockJob,
  type MockMeasurementRecord,
  type MockMethod,
  type MockSample,
  type QcType,
  type ResultValue,
} from "@/lib/mock-db";
import { equipmentAvailability } from "@/lib/equipment";
import { generateBatchNumber } from "@/lib/jobs/ids";
import { sampleCanBatch } from "@/lib/jobs/types";
import { qcMaterialsForMethod } from "@/lib/qc";
import { openBatchOfMethodContaining, sampleMethodProgress } from "./progress";
import { parseNumericInput } from "./parse";
import { parseCsv, parseImportCell, type ParsedTable } from "./import-parse";
import type {
  BatchActionResult,
  BatchActor,
  BatchApi,
  BatchCompositionInput,
  BatchDetail,
  BatchListRow,
  BulkEntry,
  BulkPreviewCell,
  EligibleSample,
  EquipmentOption,
  ImportConfigInput,
  ImportPreview,
  ImportPreviewRow,
  ImportResolution,
  MethodBatchOptions,
  ResultTarget,
  ResultValueInput,
  ResultsGrid,
  StepRailEntry,
  StepRequiredType,
} from "./types";

// Batches are stored under org-composite keys like jobs (invariant 5).
function batchKey(orgId: string, batchId: string): string {
  return `${orgId}:${batchId}`;
}

const QC_TYPE_LABELS: Record<QcType, string> = {
  blank: "Blank",
  "control-standard": "Control standard",
  crm: "CRM",
};

function labNameById(labId: string): string {
  return mockDb.labs.get(labId)?.name ?? labId;
}

function canSeeLab(actor: BatchActor, labId: string): boolean {
  if (actor.role === "admin" || actor.isSupport) return true;
  return actor.labs.includes(labNameById(labId));
}

/**
 * US-D1 authorization: Admin / Lab manager within their lab(s); Analyst only
 * when the per-lab setting allows it AND they are cleared for the method
 * (US-A4 AC 5/6). Clearances are read LIVE from the store, never trusted from
 * the client (invariant 4). Same limits apply to composition editing.
 */
export function canComposeBatch(actor: BatchActor, labId: string, methodId: string): string | null {
  if (actor.role === "read-only") return "Read-only users cannot create or edit batches.";
  if (actor.role === "admin" || actor.isSupport) return null;
  if (!actor.labs.includes(labNameById(labId))) {
    return "You can only create batches in your own lab(s).";
  }
  if (actor.role === "lab-manager") return null;
  const lab = mockDb.labs.get(labId);
  if (!lab?.analystsMayCreateBatches) {
    return "Analysts may not create batches in this lab (per-lab setting, US-A7).";
  }
  const clearances = mockDb.users.get(actor.email)?.clearances ?? [];
  return clearances.includes(methodId) ? null : "You are not cleared for this method.";
}

/** US-D3 set-back/void: Admin and Lab manager only, within their lab(s). */
function canManageBatch(actor: BatchActor, labId: string): string | null {
  if (actor.role !== "admin" && actor.role !== "lab-manager") {
    return "Only Admins and Lab managers can do this.";
  }
  if (actor.role === "admin" || actor.isSupport) return null;
  return actor.labs.includes(labNameById(labId))
    ? null
    : "You can only manage batches in your own lab(s).";
}

/** US-D3 complete step / worksheet upload: Admin, Lab manager, and Analysts
 * CLEARED for the batch's method (US-A4 AC 6) — clearances read live. */
export function canWorkBatch(actor: BatchActor, batch: MockBatch): string | null {
  if (actor.role === "read-only") return "Read-only users cannot work on batches.";
  if (actor.role === "admin" || actor.isSupport) return null;
  if (!actor.labs.includes(labNameById(batch.labId))) {
    return "You can only work on batches in your own lab(s).";
  }
  if (actor.role === "lab-manager") return null;
  const clearances = mockDb.users.get(actor.email)?.clearances ?? [];
  return clearances.includes(batch.methodId)
    ? null
    : "You are not cleared for this batch's method.";
}

function userName(email: string | null): string | null {
  if (!email) return null;
  return mockDb.users.get(email)?.name ?? email;
}

/** US-D2 AC 2: deadline passed and the batch not finished — a flag, never a
 * separate status (calendar-day comparison, like everywhere). */
function isOverdue(batch: MockBatch, deadline: string | null): boolean {
  if (!deadline) return false;
  if (batch.status === "completed" || batch.status === "voided") return false;
  return deadline < new Date().toISOString().slice(0, 10);
}

/** A BatchActor for an org member, for checking SOMEONE ELSE's right to work
 * a batch (US-D2 AC 8). null = not an assignable org user. */
function actorForOrgUser(orgId: string, email: string): BatchActor | null {
  const user = mockDb.users.get(email);
  if (!user || user.orgId !== orgId || user.status !== "active") return null;
  if (user.role === "platform-admin") return null;
  return { email: user.email, role: user.role, labs: user.labs, orgId, isSupport: false };
}

function findSample(orgId: string, sampleId: string): { job: MockJob; sample: MockSample } | null {
  for (const job of mockDb.jobs.values()) {
    if (job.orgId !== orgId) continue;
    const sample = job.samples.find((s) => s.id === sampleId);
    if (sample) return { job, sample };
  }
  return null;
}

function methodVersionByNumber(method: MockMethod, version: number): MethodVersion {
  return method.versions.find((v) => v.version === version) ?? currentMethodVersion(method);
}

function methodLabel(version: MethodVersion): string {
  return `${version.name} (${version.code})`;
}

function qcPositions(batch: { qc: { quantity: number }[] }): number {
  return batch.qc.reduce((sum, entry) => sum + entry.quantity, 0);
}

function addEvent(
  batch: MockBatch,
  actor: BatchActor,
  type: MockBatchEvent["type"],
  summary: string,
  extra: Pick<MockBatchEvent, "step" | "equipmentUsed" | "setBack"> = {},
): void {
  batch.events.push({
    id: `bev-${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    by: actor.email,
    type,
    summary,
    ...extra,
  });
}

/** AC 8 — the status label is derived from phase + position, never hand-set. */
function statusLabelFor(batch: MockBatch, pinned: MethodVersion): string {
  if (batch.status === "voided") return "Voided";
  if (batch.status === "completed") return "Completed";
  if (batch.status === "awaiting-review") return "Awaiting review";
  const step = pinned.steps[batch.currentStepIndex];
  return `At step ${batch.currentStepIndex + 1} of ${pinned.steps.length} — ${step?.name ?? ""}`;
}

/** AC 9: the earliest job deadline among the batch's samples (informational). */
function batchDeadline(batch: MockBatch): string | null {
  let min: string | null = null;
  for (const sampleId of batch.sampleIds) {
    const due = findSample(batch.orgId, sampleId)?.job.dueDate.trim();
    if (!due) continue;
    if (min === null || due < min) min = due;
  }
  return min;
}

/** AC 4: per required type, the lab's items split into selectable options
 * (Available, or Due soon with a warning) and Blocked items (never options,
 * shown with why — US-B3's computed availability is the single source). */
function requiredTypesFor(batch: MockBatch, step: MethodStep): StepRequiredType[] {
  const warnDays = getOrgSettings(batch.orgId).equipment.calibrationWarningDays;
  return step.requiredEquipmentTypes.map((typeId) => {
    const options: EquipmentOption[] = [];
    const blocked: StepRequiredType["blocked"] = [];
    for (const eq of mockDb.equipment.values()) {
      if (eq.orgId !== batch.orgId || eq.labId !== batch.labId) continue;
      if (eq.typeId !== typeId || eq.status !== "active") continue;
      const availability = equipmentAvailability(eq, warnDays);
      if (availability.state === "blocked") {
        blocked.push({ assetId: eq.assetId, name: eq.name, reasons: availability.blockedReasons });
      } else {
        options.push({
          equipmentId: eq.id,
          assetId: eq.assetId,
          name: eq.name,
          state: availability.state === "due-soon" ? "due-soon" : "available",
          warning: availability.warnings[0] ?? null,
        });
      }
    }
    options.sort((a, b) => a.assetId.localeCompare(b.assetId));
    return {
      typeId,
      typeName: mockDb.equipmentTypes.get(typeId)?.name ?? typeId,
      options,
      blocked,
    };
  });
}

/** AC 3: the Steps rail — one rendering of state + the append-only events. */
function buildStepsRail(batch: MockBatch, pinned: MethodVersion): StepRailEntry[] {
  // Latest completion per step index (a redo supersedes ON THE RAIL; every
  // record stays in History — AC 6). Events are in append order.
  const latest = new Map<number, MockBatchEvent>();
  for (const ev of batch.events) {
    if (ev.type === "step-completed" && ev.step) latest.set(ev.step.index, ev);
  }
  return pinned.steps.map((s, index) => {
    const state: StepRailEntry["state"] =
      batch.status === "awaiting-review" || batch.status === "completed"
        ? "completed"
        : index < batch.currentStepIndex
          ? "completed"
          : index === batch.currentStepIndex && batch.status === "open"
            ? "current"
            : "pending";
    const ev = state === "completed" ? latest.get(index) : undefined;
    return {
      index,
      id: s.id,
      name: s.name,
      state,
      lastCompletion: ev
        ? {
            by: ev.by,
            at: ev.at,
            equipment: (ev.equipmentUsed ?? []).map((e) => `${e.name} (${e.assetId})`),
          }
        : null,
      requiredTypes: state === "current" ? requiredTypesFor(batch, s) : [],
    };
  });
}

/** AC 3 for ONE sample — returns an error message or null. */
function sampleIneligible(
  orgId: string,
  labId: string,
  methodId: string,
  sampleId: string,
  excludeBatchId?: string,
): string | null {
  const found = findSample(orgId, sampleId);
  if (!found) return `Unknown sample ${sampleId}.`;
  const { job, sample } = found;
  if (job.labId !== labId) return `Sample ${sampleId} belongs to another lab than this batch.`;
  if (job.voided) return `Sample ${sampleId} belongs to a voided ${getOrgSettings(orgId).jobLabel.toLowerCase()}.`;
  if (sample.voided) return `Sample ${sampleId} is voided.`;
  if (!sampleCanBatch(sample)) {
    return `Sample ${sampleId} has no accepting decision — only accepted samples can enter a batch (§7.4).`;
  }
  const other = openBatchOfMethodContaining(orgId, sampleId, methodId, excludeBatchId);
  if (other) {
    return `Sample ${sampleId} is already in open batch ${other.id} for this method (one open batch per method).`;
  }
  return null;
}

/** The picker list (AC 3/5): eligible samples of the lab for one method. */
function eligibleSamples(
  orgId: string,
  labId: string,
  methodId: string,
  excludeBatchId?: string,
): EligibleSample[] {
  const typeNames = new Map(getOrgSettings(orgId).sampleTypes.map((t) => [t.id, t.name] as const));
  const out: EligibleSample[] = [];
  for (const job of mockDb.jobs.values()) {
    if (job.orgId !== orgId || job.labId !== labId || job.voided) continue;
    for (const sample of job.samples) {
      if (sample.voided || !sampleCanBatch(sample)) continue;
      if (openBatchOfMethodContaining(orgId, sample.id, methodId, excludeBatchId)) continue;
      out.push({
        id: sample.id,
        jobId: job.id,
        customer: job.customer,
        typeName: typeNames.get(sample.typeId) ?? sample.typeId,
        description: sample.description,
        acceptance: sample.acceptance as EligibleSample["acceptance"],
        requested: sample.requestedMethodIds.includes(methodId),
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function qcOptionsFor(orgId: string, labId: string, version: MethodVersion): MethodBatchOptions["qcOptions"] {
  // AC 7: active, not expired, same lab, covering ≥1 analyte by name + unit —
  // the shared US-B2 hook is the single source of that rule.
  return qcMaterialsForMethod(orgId, labId, version).map((m) => ({
    materialId: m.id,
    code: m.code,
    name: m.name,
    typeLabel: QC_TYPE_LABELS[m.type],
    lotNumber: m.lotNumber,
    expiryDate: m.expiryDate,
  }));
}

type ValidatedComposition = {
  sampleIds: string[];
  toConfirm: string[]; // ids whose requested methods gain the batch method (AC 5)
  qc: { materialId: string; quantity: number }[];
};

/** AC 3/5/6/7/12 — shared by create and the open-window edit. Validates
 * EVERYTHING before anything mutates (validate-before-mutate). */
function validateComposition(
  orgId: string,
  labId: string,
  methodId: string,
  pinned: MethodVersion,
  input: BatchCompositionInput,
  excludeBatchId?: string,
): { error: string } | ValidatedComposition {
  const sampleIds = [...new Set(input.sampleIds)];
  if (sampleIds.length < 1) return { error: "A batch needs at least one sample." };

  const confirmed = new Set(input.confirmAddMethod);
  const toConfirm: string[] = [];
  for (const sampleId of sampleIds) {
    const error = sampleIneligible(orgId, labId, methodId, sampleId, excludeBatchId);
    if (error) return { error };
    const { sample } = findSample(orgId, sampleId)!;
    if (!sample.requestedMethodIds.includes(methodId)) {
      // AC 5: possible only after explicit confirmation, which records the
      // method onto the sample's requested list.
      if (!confirmed.has(sampleId)) {
        return {
          error: `Sample ${sampleId} does not request this method — confirm adding the method to the sample first.`,
        };
      }
      toConfirm.push(sampleId);
    }
  }

  const allowedQc = new Map(qcOptionsFor(orgId, labId, pinned).map((o) => [o.materialId, o] as const));
  const seenQc = new Set<string>();
  const qc: ValidatedComposition["qc"] = [];
  for (const entry of input.qc) {
    if (seenQc.has(entry.materialId)) {
      return { error: "A QC material can be added only once per batch — adjust its quantity instead." };
    }
    seenQc.add(entry.materialId);
    if (!allowedQc.has(entry.materialId)) {
      return { error: "A selected QC material is not available for this method (inactive, expired, other lab, or no covered analyte)." };
    }
    if (!Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 99) {
      return { error: "QC quantity must be a whole number between 1 and 99." };
    }
    qc.push({ materialId: entry.materialId, quantity: entry.quantity });
  }

  // AC 6: capacity = occupied positions, client samples PLUS QC units.
  const positions = sampleIds.length + qc.reduce((s, e) => s + e.quantity, 0);
  if (positions > pinned.maxSamplesPerBatch) {
    return {
      error: `This composition needs ${positions} positions but the method allows ${pinned.maxSamplesPerBatch} (samples + QC count alike).`,
    };
  }
  return { sampleIds, toConfirm, qc };
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * AC 8 — the working copy. The mock cannot merge into the real template
 * (template BYTES are not retained here, only their checksums), so it
 * generates the batch sheet itself — batch number, method + version, the
 * pinned template reference, creation date and the ordered composition — as
 * CSV, with a real SHA-256 recorded over the real bytes. The real backend
 * generates the actual Excel from the stored template version; the sheet
 * columns and the checksum discipline are identical.
 */
function generateWorkingCopy(actor: BatchActor, batch: MockBatch, pinned: MethodVersion): void {
  const method = mockDb.methods.get(batch.methodId);
  const template = method?.templates.find((t) => t.version === batch.templateVersion) ?? null;
  const typeNames = new Map(getOrgSettings(batch.orgId).sampleTypes.map((t) => [t.id, t.name] as const));

  const lines: string[][] = [
    ["Batch", batch.id],
    ["Method", `${methodLabel(pinned)} v${pinned.version}`],
    [
      "Template",
      template
        ? `${template.fileName} v${template.version} (sha256 ${template.sha256})`
        : "— (the pinned method version has no template)",
    ],
    ["Created", batch.createdAt],
    ["Created by", batch.createdBy],
    [],
    ["Position", "Type", "ID / code", "Description"],
  ];
  let position = 1;
  for (const sampleId of batch.sampleIds) {
    const found = findSample(batch.orgId, sampleId);
    lines.push([
      String(position++),
      "Sample",
      sampleId,
      found ? `${typeNames.get(found.sample.typeId) ?? ""} — ${found.sample.description}` : "",
    ]);
  }
  for (const entry of batch.qc) {
    const material = mockDb.qcMaterials.get(entry.materialId);
    for (let unit = 1; unit <= entry.quantity; unit++) {
      lines.push([
        String(position++),
        "QC",
        material?.code ?? entry.materialId,
        `${material?.name ?? ""}${material?.lotNumber ? ` (lot ${material.lotNumber})` : ""}${entry.quantity > 1 ? ` — unit ${unit} of ${entry.quantity}` : ""}`,
      ]);
    }
  }

  const bytes = Buffer.from(lines.map((row) => row.map(csvField).join(",")).join("\r\n"), "utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  batch.workingCopy = {
    fileName: `working_copy_${batch.id}.csv`,
    sizeBytes: bytes.length,
    sha256,
    generatedAt: new Date().toISOString(),
  };
  mockDb.batchFiles.set(batchKey(batch.orgId, batch.id), new Uint8Array(bytes));
  addEvent(batch, actor, "working-copy-generated", `${batch.workingCopy.fileName} (sha256 ${sha256.slice(0, 16)}…)`);
}

/** AC 5: record the confirmed additions onto the samples' requested lists. */
function applyConfirmedMethods(actor: BatchActor, batch: MockBatch, sampleIds: string[]): void {
  for (const sampleId of sampleIds) {
    const found = findSample(batch.orgId, sampleId);
    if (found && !found.sample.requestedMethodIds.includes(batch.methodId)) {
      found.sample.requestedMethodIds.push(batch.methodId);
      addEvent(
        batch,
        actor,
        "composition-changed",
        `Method added to ${sampleId}'s requested methods (confirmed at batch composition)`,
      );
    }
  }
}

export const mockBatchApi: BatchApi = {
  async listBatches(actor, activeLabId): Promise<BatchListRow[]> {
    return [...mockDb.batches.values()]
      .filter((b) => b.orgId === actor.orgId && canSeeLab(actor, b.labId))
      // Work screen: scoped to the active lab; org-wide ONLY for a support
      // session (same rule as the job overview — never "all labs" for a
      // scoped user with no active lab).
      .filter((b) => (actor.isSupport && activeLabId === null) || b.labId === activeLabId)
      .map((b) => {
        const method = mockDb.methods.get(b.methodId);
        const pinned = method ? methodVersionByNumber(method, b.methodVersion) : null;
        const deadline = batchDeadline(b);
        const active = b.status === "open" || b.status === "awaiting-review";
        return {
          id: b.id,
          methodId: b.methodId,
          methodLabel: pinned ? methodLabel(pinned) : b.methodId,
          methodVersion: b.methodVersion,
          stepName: pinned?.steps[b.currentStepIndex]?.name ?? `Step ${b.currentStepIndex + 1}`,
          status: b.status,
          statusLabel: pinned ? statusLabelFor(b, pinned) : b.status,
          deadline,
          overdue: isOverdue(b, deadline),
          assignee: b.assignee,
          assigneeName: userName(b.assignee),
          // US-D2 AC 6: claimable = unassigned, unfinished, and THIS actor may
          // work on it (per-batch: clearance depends on the method).
          canClaim: active && b.assignee === null && canWorkBatch(actor, b) === null,
          mine: b.assignee === actor.email,
          sampleCount: b.sampleIds.length,
          qcPositions: qcPositions(b),
          maxPositions: pinned?.maxSamplesPerBatch ?? 0,
          compositionLatched: b.compositionLatched,
          createdAt: b.createdAt,
          createdBy: b.createdBy,
        };
      })
      // US-D2 AC 1: deadline ascending (overdue naturally on top), batches
      // without a deadline last; creation date as the tiebreak.
      .sort(
        (a, b) =>
          (a.deadline ?? "9999-99-99").localeCompare(b.deadline ?? "9999-99-99") ||
          a.createdAt.localeCompare(b.createdAt),
      );
  },

  async getBatch(actor, batchId): Promise<BatchDetail | null> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId || !canSeeLab(actor, batch.labId)) return null;
    const method = mockDb.methods.get(batch.methodId);
    if (!method) return null;
    const pinned = methodVersionByNumber(method, batch.methodVersion);
    const typeNames = new Map(getOrgSettings(actor.orgId).sampleTypes.map((t) => [t.id, t.name] as const));

    const compositionOpen =
      batch.status === "open" && !batch.compositionLatched && batch.currentStepIndex === 0;

    return {
      record: batch,
      labName: labNameById(batch.labId),
      methodLabel: methodLabel(pinned),
      stepName: pinned.steps[batch.currentStepIndex]?.name ?? `Step ${batch.currentStepIndex + 1}`,
      maxPositions: pinned.maxSamplesPerBatch,
      positionsUsed: batch.sampleIds.length + qcPositions(batch),
      samples: batch.sampleIds.map((sampleId) => {
        const found = findSample(actor.orgId, sampleId);
        return {
          id: sampleId,
          jobId: found?.job.id ?? "",
          customer: found?.job.customer ?? "",
          typeName: found ? (typeNames.get(found.sample.typeId) ?? found.sample.typeId) : "",
          description: found?.sample.description ?? "",
          acceptance: found?.sample.acceptance ?? null,
          requested: found?.sample.requestedMethodIds.includes(batch.methodId) ?? false,
        };
      }),
      qc: batch.qc.map((entry) => {
        const material = mockDb.qcMaterials.get(entry.materialId);
        return {
          materialId: entry.materialId,
          code: material?.code ?? entry.materialId,
          name: material?.name ?? "",
          typeLabel: material ? QC_TYPE_LABELS[material.type] : "",
          lotNumber: material?.lotNumber ?? "",
          expiryDate: material?.expiryDate ?? "",
          quantity: entry.quantity,
        };
      }),
      compositionOpen,
      addableSamples: compositionOpen
        ? eligibleSamples(actor.orgId, batch.labId, batch.methodId, batch.id).filter(
            (s) => !batch.sampleIds.includes(s.id),
          )
        : [],
      qcOptions: compositionOpen ? qcOptionsFor(actor.orgId, batch.labId, pinned) : [],
      assignee: batch.assignee,
      assigneeName: userName(batch.assignee),
      statusLabel: statusLabelFor(batch, pinned),
      deadline: batchDeadline(batch),
      steps: buildStepsRail(batch, pinned),
      worksheets: batch.worksheets,
      // History IS the event list — the tab renders this array directly,
      // never a copy (AC 2/11).
      events: batch.events,
      sampleProgress: Object.fromEntries(
        batch.sampleIds.map((id) => [id, sampleMethodProgress(actor.orgId, id, batch.methodId)]),
      ),
    };
  },

  async creationOptions(actor, labId): Promise<MethodBatchOptions[]> {
    const out: MethodBatchOptions[] = [];
    for (const method of mockDb.methods.values()) {
      if (method.orgId !== actor.orgId || method.status !== "active") continue;
      const current = currentMethodVersion(method);
      if (current.labId !== labId) continue;
      out.push({
        methodId: method.id,
        label: `${methodLabel(current)} — v${current.version}`,
        version: current.version,
        maxPositions: current.maxSamplesPerBatch,
        firstStepName: current.steps[0]?.name ?? "Step 1",
        hasTemplate: current.templateVersion !== null,
        eligibleSamples: eligibleSamples(actor.orgId, labId, method.id),
        qcOptions: qcOptionsFor(actor.orgId, labId, current),
      });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  },

  async createBatch(actor, input): Promise<BatchActionResult> {
    const denied = canComposeBatch(actor, input.labId, input.methodId);
    if (denied) return { status: "error", message: denied };

    const lab = mockDb.labs.get(input.labId);
    if (!lab || lab.orgId !== actor.orgId || lab.status !== "active") {
      return { status: "error", message: "Choose an active lab." };
    }
    // AC 1: exactly one ACTIVE method of the batch's lab; the LATEST version
    // is pinned at creation and never changes afterwards.
    const method = mockDb.methods.get(input.methodId);
    if (!method || method.orgId !== actor.orgId || method.status !== "active") {
      return { status: "error", message: "Choose an active method." };
    }
    const pinned = currentMethodVersion(method);
    if (pinned.labId !== input.labId) {
      return { status: "error", message: "The method belongs to another lab." };
    }

    const validated = validateComposition(
      actor.orgId,
      input.labId,
      input.methodId,
      pinned,
      input,
    );
    if ("error" in validated) return { status: "error", message: validated.error };

    // Consume the immutable number; never overwrite an issued one (hard-never).
    const batchNumber = generateBatchNumber(actor.orgId, input.labId);
    if (mockDb.batches.has(batchKey(actor.orgId, batchNumber))) {
      return {
        status: "error",
        message:
          "The generated batch number is already in use — check the identifier format and sequence-reset settings.",
      };
    }

    const batch: MockBatch = {
      id: batchNumber,
      orgId: actor.orgId,
      labId: input.labId,
      methodId: input.methodId,
      methodVersion: pinned.version,
      templateVersion: pinned.templateVersion, // pinned template included (AC 1/8)
      status: "open",
      currentStepIndex: 0, // AC 9: the batch enters the method's first step
      compositionLatched: false, // AC 10: flips ONE WAY at first advance/work (US-D3/D4)
      assignee: null, // US-D2: born into the open pool
      sampleIds: validated.sampleIds,
      qc: validated.qc,
      workingCopy: null,
      worksheets: [], // US-D4 AC 9 versions; gates the final step (US-D3 AC 5)
      results: [], // ADR-2 measurement records (US-D4) — append-only
      imports: [], // US-D5 import events — append-only
      reagentLotIds: [], // AC 11 hook
      events: [],
      createdAt: new Date().toISOString(),
      createdBy: actor.email,
    };
    mockDb.batches.set(batchKey(actor.orgId, batchNumber), batch);
    addEvent(
      batch,
      actor,
      "created",
      `Batch created: ${validated.sampleIds.length} sample(s) + ${qcPositions(batch)} QC position(s), ${methodLabel(pinned)} v${pinned.version} pinned`,
    );
    applyConfirmedMethods(actor, batch, validated.toConfirm);
    generateWorkingCopy(actor, batch, pinned);

    // US-B1 AC 9: the method is now used by a batch — subsequent method edits
    // must create a NEW version (the mock flag becomes real here).
    method.usedByBatches = true;

    return { status: "success", batchId: batchNumber };
  },

  async updateComposition(actor, batchId, input): Promise<BatchActionResult> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId) return { status: "error", message: "Unknown batch." };
    const denied = canComposeBatch(actor, batch.labId, batch.methodId);
    if (denied) return { status: "error", message: denied };

    // AC 10 — the one-way latch. Checked on ALL THREE facts so a set-back
    // (step index back at 0) can never reopen composition: the latch flag
    // itself is never reset by any code path (hard-never list).
    if (batch.status !== "open") {
      return { status: "error", message: "Only open batches can be edited." };
    }
    if (batch.compositionLatched || batch.currentStepIndex > 0) {
      return {
        status: "error",
        message:
          "Composition is locked: work has been recorded on this batch. A sample that cannot continue is closed out with a no-result (US-D4); a wrongly composed batch is voided (US-D3).",
      };
    }

    const method = mockDb.methods.get(batch.methodId);
    if (!method) return { status: "error", message: "Unknown method." };
    // Validation runs against the PINNED version (capacity, QC coverage) —
    // a newer method version must change nothing on this batch (AC 1).
    const pinned = methodVersionByNumber(method, batch.methodVersion);
    const validated = validateComposition(
      actor.orgId,
      batch.labId,
      batch.methodId,
      pinned,
      input,
      batch.id,
    );
    if ("error" in validated) return { status: "error", message: validated.error };

    const beforeSamples = new Set(batch.sampleIds);
    const afterSamples = new Set(validated.sampleIds);
    const added = validated.sampleIds.filter((id) => !beforeSamples.has(id));
    const removed = batch.sampleIds.filter((id) => !afterSamples.has(id));
    const qcBefore = new Map(batch.qc.map((e) => [e.materialId, e.quantity] as const));
    const qcAfter = new Map(validated.qc.map((e) => [e.materialId, e.quantity] as const));
    const qcChanged =
      qcBefore.size !== qcAfter.size ||
      [...qcAfter].some(([id, quantity]) => qcBefore.get(id) !== quantity);

    batch.sampleIds = validated.sampleIds;
    batch.qc = validated.qc;
    applyConfirmedMethods(actor, batch, validated.toConfirm);

    if (added.length || removed.length || qcChanged) {
      const parts = [
        added.length ? `added ${added.join(", ")}` : null,
        // Removal in the open window returns the sample's per-method state to
        // Received — automatically, because the state is derived (AC 10).
        removed.length ? `removed ${removed.join(", ")}` : null,
        qcChanged
          ? `QC set now: ${validated.qc.map((e) => `${mockDb.qcMaterials.get(e.materialId)?.code ?? e.materialId}×${e.quantity}`).join(", ") || "none"}`
          : null,
      ].filter(Boolean);
      addEvent(batch, actor, "composition-changed", parts.join("; "));
      // Keep the downloadable working copy truthful to the composition.
      generateWorkingCopy(actor, batch, pinned);
    }
    return { status: "success", batchId };
  },

  async workingCopyFile(actor, batchId) {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId || !canSeeLab(actor, batch.labId)) return null;
    if (!batch.workingCopy) return null;
    const bytes = mockDb.batchFiles.get(batchKey(actor.orgId, batchId));
    if (!bytes) return null; // seed batches carry metadata only
    return { fileName: batch.workingCopy.fileName, bytes };
  },

  // ---- US-D3: the step engine ---------------------------------------------

  async completeStep(actor, batchId, expectedStepIndex, equipment): Promise<BatchActionResult> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId) return { status: "error", message: "Unknown batch." };
    const denied = canWorkBatch(actor, batch);
    if (denied) return { status: "error", message: denied };
    if (batch.status === "voided") {
      return { status: "error", message: "A voided batch accepts no transitions." };
    }
    if (batch.status === "completed" || batch.status === "awaiting-review") {
      return { status: "error", message: "This batch has finished its steps — it is with review." };
    }
    // AC 10 concurrency: the client says which step it THINKS is current; a
    // stale value (someone else advanced or set back meanwhile) fails safely.
    if (expectedStepIndex !== batch.currentStepIndex) {
      return {
        status: "error",
        message: "This batch changed while you were looking — refresh the page and try again.",
      };
    }

    const method = mockDb.methods.get(batch.methodId);
    if (!method) return { status: "error", message: "Unknown method." };
    const pinned = methodVersionByNumber(method, batch.methodVersion);
    const step = pinned.steps[batch.currentStepIndex];
    if (!step) return { status: "error", message: "The batch is not at a valid step — refresh." };

    // AC 4: one specific item per required type, from this lab, never Blocked.
    // Availability is recomputed server-side at THIS moment — the UI list is
    // presentation, not the gate (invariant 4).
    const submitted = new Map<string, string>();
    for (const e of equipment) {
      if (submitted.has(e.typeId)) {
        return { status: "error", message: "Duplicate equipment type in the selection." };
      }
      submitted.set(e.typeId, e.equipmentId);
    }
    const warnDays = getOrgSettings(batch.orgId).equipment.calibrationWarningDays;
    const used: NonNullable<MockBatchEvent["equipmentUsed"]> = [];
    for (const typeId of step.requiredEquipmentTypes) {
      const typeName = mockDb.equipmentTypes.get(typeId)?.name ?? typeId;
      const equipmentId = submitted.get(typeId);
      if (!equipmentId) {
        const anySelectable = requiredTypesFor(batch, step).some(
          (rt) => rt.typeId === typeId && rt.options.length > 0,
        );
        return {
          status: "error",
          message: anySelectable
            ? `Select the ${typeName} used for this step.`
            : `No usable ${typeName} in this lab — the step cannot be completed until one is fit for use (US-B3).`,
        };
      }
      const eq = mockDb.equipment.get(equipmentId);
      if (!eq || eq.orgId !== actor.orgId || eq.labId !== batch.labId || eq.typeId !== typeId || eq.status !== "active") {
        return { status: "error", message: `The selected ${typeName} is not a valid choice for this step.` };
      }
      const availability = equipmentAvailability(eq, warnDays);
      if (availability.state === "blocked") {
        return {
          status: "error",
          message: `${eq.name} (${eq.assetId}) is Blocked — ${availability.blockedReasons[0]}.`,
        };
      }
      used.push({ equipmentId: eq.id, assetId: eq.assetId, name: eq.name, typeName });
      submitted.delete(typeId);
    }
    if (submitted.size > 0) {
      return {
        status: "error",
        message: "The equipment selection does not match this step's required types — refresh and try again.",
      };
    }

    const isFinal = batch.currentStepIndex === pinned.steps.length - 1;
    // AC 5 (US-D4 AC 9 gate): review judges a stable record — the completed
    // worksheet must be attached before the final step can complete.
    if (isFinal && batch.worksheets.length === 0) {
      return {
        status: "error",
        message:
          "Attach the completed worksheet (Files tab) before completing the final step — the transition to review is gated on it (US-D4).",
      };
    }

    // The first recorded work flips the ONE-WAY latch (US-D1 AC 10).
    batch.compositionLatched = true;
    const equipmentNote = used.length
      ? ` — ${used.map((u) => `${u.name} (${u.assetId})`).join(", ")}`
      : "";
    addEvent(
      batch,
      actor,
      "step-completed",
      `Step ${batch.currentStepIndex + 1} "${step.name}" completed${equipmentNote}${isFinal ? " — batch moved to Awaiting review" : ""}`,
      {
        step: { index: batch.currentStepIndex, id: step.id, name: step.name },
        equipmentUsed: used.length ? used : undefined,
      },
    );
    if (isFinal) {
      batch.status = "awaiting-review"; // AC 5 — a system phase, not a step
    } else {
      batch.currentStepIndex += 1;
    }
    return { status: "success", batchId };
  },

  async setBackStep(actor, batchId, toStepIndex, reason): Promise<BatchActionResult> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId) return { status: "error", message: "Unknown batch." };
    const denied = canManageBatch(actor, batch.labId);
    if (denied) return { status: "error", message: denied };
    if (batch.status === "voided" || batch.status === "completed") {
      return { status: "error", message: "A voided or completed batch accepts no transitions." };
    }
    if (!reason.trim()) {
      return { status: "error", message: "A reason is required to set a batch back." };
    }
    const method = mockDb.methods.get(batch.methodId);
    if (!method) return { status: "error", message: "Unknown method." };
    const pinned = methodVersionByNumber(method, batch.methodVersion);
    // From Awaiting review any step may be targeted; from an open batch only
    // an EARLIER step (AC 6).
    const fromReview = batch.status === "awaiting-review";
    const maxTarget = fromReview ? pinned.steps.length - 1 : batch.currentStepIndex - 1;
    if (!Number.isInteger(toStepIndex) || toStepIndex < 0 || toStepIndex > maxTarget) {
      return { status: "error", message: "Choose an earlier step to set the batch back to." };
    }
    const target = pinned.steps[toStepIndex];
    const fromLabel = fromReview
      ? "Awaiting review"
      : `step ${batch.currentStepIndex + 1} "${pinned.steps[batch.currentStepIndex]?.name ?? ""}"`;
    addEvent(
      batch,
      actor,
      "set-back",
      `Set back from ${fromLabel} to step ${toStepIndex + 1} "${target.name}" — ${reason.trim()}`,
      {
        setBack: {
          // Awaiting review is encoded as one past the last step index.
          fromIndex: fromReview ? pinned.steps.length : batch.currentStepIndex,
          toIndex: toStepIndex,
          reason: reason.trim(),
        },
      },
    );
    batch.status = "open";
    batch.currentStepIndex = toStepIndex;
    // Deliberately NOT touched: compositionLatched — a set-back is rework and
    // never reopens composition (US-D1 AC 10 mirror; hard-never list).
    return { status: "success", batchId };
  },

  async voidBatch(actor, batchId, reason): Promise<BatchActionResult> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId) return { status: "error", message: "Unknown batch." };
    const denied = canManageBatch(actor, batch.labId);
    if (denied) return { status: "error", message: denied };
    if (batch.status === "voided") return { status: "error", message: "This batch is already voided." };
    if (batch.status === "completed") {
      return { status: "error", message: "A completed batch cannot be voided." };
    }
    if (!reason.trim()) return { status: "error", message: "A reason is required to void a batch." };
    // Void, never delete (AC 7): the record, its files and its history stay;
    // the samples' per-method state returns to Received automatically because
    // the derived view skips voided batches (US-D1 decision). Results already
    // recorded can never become valid — enforced where results live (US-D4).
    batch.status = "voided";
    batch.voidReason = reason.trim();
    addEvent(batch, actor, "voided", `Batch voided — ${reason.trim()}`);
    return { status: "success", batchId };
  },

  async uploadWorksheet(actor, batchId, file): Promise<BatchActionResult> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId) return { status: "error", message: "Unknown batch." };
    const denied = canWorkBatch(actor, batch);
    if (denied) return { status: "error", message: denied };
    if (batch.status !== "open") {
      return {
        status: "error",
        message: "Worksheets can only be uploaded while the batch is being worked — during review the record is closed (a set-back reopens it).",
      };
    }
    if (file.bytes.length === 0) return { status: "error", message: "The uploaded file is empty." };
    if (file.bytes.length > 5 * 1024 * 1024) {
      return { status: "error", message: "Worksheets are limited to 5 MB in the mock." };
    }
    // US-D4 AC 9: replacing = a NEW version appended; nothing is overwritten.
    const attachment = {
      id: `att-ws-${crypto.randomUUID()}`,
      fileName: file.fileName,
      sizeBytes: file.bytes.length,
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
      uploadedAt: new Date().toISOString(),
      uploadedBy: actor.email,
    };
    batch.worksheets.push(attachment);
    mockDb.batchFiles.set(`${batch.orgId}:ws:${attachment.id}`, new Uint8Array(file.bytes));
    addEvent(
      batch,
      actor,
      "worksheet-uploaded",
      `Completed worksheet v${batch.worksheets.length}: ${file.fileName} (sha256 ${attachment.sha256.slice(0, 16)}…)`,
    );
    return { status: "success", batchId };
  },

  // ---- US-D4: manual data entry ------------------------------------------

  async resultsGrid(actor, batchId): Promise<ResultsGrid | null> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId || !canSeeLab(actor, batch.labId)) return null;
    const method = mockDb.methods.get(batch.methodId);
    if (!method) return null;
    const pinned = methodVersionByNumber(method, batch.methodVersion);

    const rows: ResultsGrid["rows"] = [
      ...batch.sampleIds.map((sampleId) => {
        const found = findSample(actor.orgId, sampleId);
        return {
          targetType: "sample" as const,
          targetId: sampleId,
          label: sampleId,
          sub: found ? `${found.job.customer} — ${found.sample.description}` : "",
        };
      }),
      ...batch.qc.map((entry) => {
        const material = mockDb.qcMaterials.get(entry.materialId);
        return {
          targetType: "qc" as const,
          targetId: entry.materialId,
          label: rowLabelFor(batch, { targetType: "qc", targetId: entry.materialId }),
          sub: `${material?.name ?? ""}${material?.lotNumber ? ` (lot ${material.lotNumber})` : ""}`,
        };
      }),
    ];

    // Chains newest-first per cell (AC 8); the head is the current value.
    const cells: ResultsGrid["cells"] = {};
    for (const record of batch.results) {
      const key = cellKey({ targetType: record.targetType, targetId: record.targetId }, record.analyteId);
      const cell = (cells[key] ??= { current: null, chain: [] });
      cell.chain.unshift(record);
      cell.current = cell.chain[0];
    }

    const closed = entryClosed(batch);
    return {
      entryOpen: closed === null,
      entryClosedReason: closed,
      columns: pinned.analytes.map((a) => ({ analyteId: a.id, name: a.name, unit: a.unit, loq: a.loq })),
      rows,
      cells,
      qualifiers: getOrgSettings(actor.orgId)
        .resultQualifiers.filter((q) => q.active)
        .map((q) => ({ id: q.id, name: q.name })),
      filled: Object.keys(cells).length,
      total: rows.length * pinned.analytes.length,
      worksheetCount: batch.worksheets.length,
    };
  },

  async enterResult(actor, batchId, target, analyteId, input, supersedeReason): Promise<BatchActionResult> {
    const loaded = loadForEntry(actor, batchId);
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const { batch, pinned } = loaded;

    const targetError = validateTarget(batch, pinned, target, analyteId);
    if (targetError) return { status: "error", message: targetError };
    const validated = validateResultInput(batch.orgId, input);
    if ("error" in validated) return { status: "error", message: validated.error };

    const existing = currentByCell(batch).get(cellKey(target, analyteId)) ?? null;
    const reason = supersedeReason.trim();
    // AC 8: correction = supersede, ALWAYS with a reason; the original stays.
    if (existing && !reason) {
      return { status: "error", message: "This cell already has a value — a correction requires a reason." };
    }

    const analyteName = pinned.analytes.find((a) => a.id === analyteId)?.name ?? analyteId;
    appendRecord(
      batch,
      actor,
      target,
      analyteId,
      validated.value,
      "manual",
      null,
      null,
      existing,
      existing ? reason : null,
      rowLabelFor(batch, target),
      analyteName,
    );
    return { status: "success", batchId };
  },

  async previewBulk(actor, batchId, entries) {
    const loaded = loadForEntry(actor, batchId);
    if ("error" in loaded) return { status: "error", message: loaded.error };
    if (entries.length === 0) return { status: "error", message: "The pasted block contains no values." };
    if (entries.length > 500) return { status: "error", message: "The pasted block is too large (max 500 cells)." };
    return { status: "success", cells: previewEntries(loaded.batch, loaded.pinned, entries) };
  },

  async confirmBulk(actor, batchId, entries): Promise<BatchActionResult> {
    const loaded = loadForEntry(actor, batchId);
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const { batch, pinned } = loaded;
    if (entries.length > 500) return { status: "error", message: "The pasted block is too large (max 500 cells)." };

    // Re-validated server-side at confirm; only accepted cells are written,
    // rejected/occupied cells stay empty for manual handling (AC 13).
    let written = 0;
    for (const cell of previewEntries(batch, pinned, entries)) {
      if (cell.outcome.kind !== "accepted") continue;
      const input = interpretRawCell(batch.orgId, cell.raw);
      if ("error" in input) continue;
      const validated = validateResultInput(batch.orgId, input);
      if ("error" in validated) continue;
      const analyteName = pinned.analytes.find((a) => a.id === cell.analyteId)?.name ?? cell.analyteId;
      appendRecord(batch, actor, cell.target, cell.analyteId, validated.value, "manual", null, null, null, null, cell.rowLabel, analyteName);
      written += 1;
    }
    if (written === 0) return { status: "error", message: "No accepted cells to write — fix the rejected ones and try again." };
    return { status: "success", batchId };
  },

  async previewWorksheet(actor, batchId) {
    const loaded = loadForEntry(actor, batchId);
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const parsed = parseWorksheetEntries(loaded.batch, loaded.pinned);
    if ("error" in parsed) return { status: "error", message: parsed.error };
    return {
      status: "success",
      worksheetVersion: parsed.worksheetVersion,
      cells: previewEntries(loaded.batch, loaded.pinned, parsed.entries),
      notices: parsed.notices,
    };
  },

  async confirmWorksheet(actor, batchId): Promise<BatchActionResult> {
    const loaded = loadForEntry(actor, batchId);
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const { batch, pinned } = loaded;
    // The server RE-READS the worksheet itself — origin "worksheet" always
    // means "this value came from that file version", never a client claim.
    const parsed = parseWorksheetEntries(batch, pinned);
    if ("error" in parsed) return { status: "error", message: parsed.error };

    let written = 0;
    for (const cell of previewEntries(batch, pinned, parsed.entries)) {
      if (cell.outcome.kind !== "accepted") continue;
      const input = interpretRawCell(batch.orgId, cell.raw);
      if ("error" in input) continue;
      const validated = validateResultInput(batch.orgId, input);
      if ("error" in validated) continue;
      const analyteName = pinned.analytes.find((a) => a.id === cell.analyteId)?.name ?? cell.analyteId;
      appendRecord(
        batch,
        actor,
        cell.target,
        cell.analyteId,
        validated.value,
        "worksheet",
        parsed.worksheetVersion,
        null,
        null,
        null,
        cell.rowLabel,
        analyteName,
      );
      written += 1;
    }
    if (written === 0) {
      return { status: "error", message: "Nothing to write — every readable cell is occupied or rejected." };
    }
    return { status: "success", batchId };
  },

  // ---- US-D2: the coordination layer --------------------------------------

  async claimBatch(actor, batchId): Promise<BatchActionResult> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId) return { status: "error", message: "Unknown batch." };
    const denied = canWorkBatch(actor, batch);
    if (denied) return { status: "error", message: denied };
    if (batch.status === "completed" || batch.status === "voided") {
      return { status: "error", message: "A finished batch is not claimed — it is a closed record." };
    }
    if (batch.assignee !== null) {
      return {
        status: "error",
        message: `Already assigned to ${userName(batch.assignee)} — you can still work on it (open pool), or ask a manager to reassign.`,
      };
    }
    batch.assignee = actor.email;
    addEvent(batch, actor, "assignment-changed", `Claimed by ${userName(actor.email)}`);
    return { status: "success", batchId };
  },

  async releaseClaim(actor, batchId): Promise<BatchActionResult> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId) return { status: "error", message: "Unknown batch." };
    if (batch.assignee !== actor.email) {
      return { status: "error", message: "You can only release your own claim — managers reassign via Assign." };
    }
    batch.assignee = null;
    addEvent(batch, actor, "assignment-changed", `Claim released by ${userName(actor.email)} — back in the open pool`);
    return { status: "success", batchId };
  },

  async assignBatch(actor, batchId, assigneeEmail): Promise<BatchActionResult> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId) return { status: "error", message: "Unknown batch." };
    const denied = canManageBatch(actor, batch.labId); // AC 8: Admin / Lab manager only
    if (denied) return { status: "error", message: denied };
    if (batch.status === "completed" || batch.status === "voided") {
      return { status: "error", message: "A finished batch is not assigned — it is a closed record." };
    }

    if (assigneeEmail === null) {
      if (batch.assignee === null) return { status: "success", batchId };
      const previous = userName(batch.assignee);
      batch.assignee = null;
      addEvent(batch, actor, "assignment-changed", `Unassigned (was ${previous})`);
      return { status: "success", batchId };
    }

    // AC 8: the target must be ALLOWED to work on this batch — same US-D3
    // rule, evaluated for the target user against the live store.
    const targetActor = actorForOrgUser(actor.orgId, assigneeEmail);
    if (!targetActor) return { status: "error", message: "Unknown or inactive user." };
    const targetDenied = canWorkBatch(targetActor, batch);
    if (targetDenied) {
      return {
        status: "error",
        message: `${userName(assigneeEmail)} cannot be assigned: ${targetDenied}`,
      };
    }
    if (batch.assignee === assigneeEmail) return { status: "success", batchId };
    const previous = batch.assignee ? ` (was ${userName(batch.assignee)})` : "";
    batch.assignee = assigneeEmail;
    addEvent(batch, actor, "assignment-changed", `Assigned to ${userName(assigneeEmail)}${previous}`);
    return { status: "success", batchId };
  },

  // ---- US-D5: instrument import --------------------------------------------

  async listImportConfigs(actor, labId): Promise<MockImportConfig[]> {
    if (!canSeeLab(actor, labId)) return [];
    return [...mockDb.importConfigs.values()]
      .filter((c) => c.orgId === actor.orgId && c.labId === labId)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async saveImportConfig(actor, configId, input): Promise<BatchActionResult> {
    const denied = canManageConfigs(actor, input.labId);
    if (denied) return { status: "error", message: denied };
    const error = validateConfigInput(actor, input);
    if (error) return { status: "error", message: error };

    const normalized = {
      name: input.name.trim(),
      labId: input.labId,
      fileType: input.fileType,
      orientation: input.orientation,
      idColumn: input.idColumn.trim(),
      columns: input.orientation === "wide"
        ? input.columns.map((c) => ({
            header: c.header.trim(),
            analyteName: c.analyteName.trim(),
            unit: c.unit === null ? null : c.unit.trim(),
          }))
        : [],
      analyteColumn: input.orientation === "long" ? input.analyteColumn.trim() : "",
      valueColumn: input.orientation === "long" ? input.valueColumn.trim() : "",
      longUnits: input.orientation === "long"
        ? input.longUnits.map((u) => ({
            analyteName: u.analyteName.trim(),
            unit: u.unit === null ? null : u.unit.trim(),
          }))
        : [],
      decimalSeparator: input.decimalSeparator,
      csvDelimiter: input.csvDelimiter,
    };

    if (configId === null) {
      const id = `imp-${crypto.randomUUID()}`;
      mockDb.importConfigs.set(id, { id, orgId: actor.orgId, status: "active", ...normalized });
      return { status: "success" };
    }
    const config = mockDb.importConfigs.get(configId);
    if (!config || config.orgId !== actor.orgId) return { status: "error", message: "Unknown configuration." };
    const denied2 = canManageConfigs(actor, config.labId);
    if (denied2) return { status: "error", message: denied2 };
    // Config changes are audited with before/after by the real backend
    // (invariant 1); past imports stay explainable regardless — each event
    // froze the mapping it applied (decision 4 Jul 2026).
    Object.assign(config, normalized);
    return { status: "success" };
  },

  async setImportConfigStatus(actor, configId, status, reason): Promise<BatchActionResult> {
    const config = mockDb.importConfigs.get(configId);
    if (!config || config.orgId !== actor.orgId) return { status: "error", message: "Unknown configuration." };
    const denied = canManageConfigs(actor, config.labId);
    if (denied) return { status: "error", message: denied };
    if (config.status === status) return { status: "success" };
    if (!reason.trim()) {
      return { status: "error", message: "A reason is required to change the configuration's status." };
    }
    // Deactivate, never delete (AC 1).
    config.status = status;
    config.statusReason = reason.trim();
    return { status: "success" };
  },

  async previewImport(actor, batchId, configId, file) {
    const loaded = loadForEntry(actor, batchId); // same window as manual entry (AC 2)
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const { batch, pinned } = loaded;
    const config = mockDb.importConfigs.get(configId);
    if (!config || config.orgId !== actor.orgId || config.labId !== batch.labId) {
      return { status: "error", message: "Unknown import configuration for this lab." };
    }
    if (config.status !== "active") {
      return { status: "error", message: "This import configuration is deactivated." };
    }
    if (file.bytes.length === 0) return { status: "error", message: "The file is empty." };
    if (file.bytes.length > 5 * 1024 * 1024) {
      return { status: "error", message: "Import files are limited to 5 MB in the mock." };
    }

    const table = await readImportTable(config, file.fileName, file.bytes);
    if ("error" in table) return { status: "error", message: table.error };
    const computed = computeImport(batch, pinned, config, table);
    if ("error" in computed) return { status: "error", message: computed.error };

    // Decorate with conflicts against the CURRENT grid (AC 7).
    const current = currentByCell(batch);
    const rows: ImportPreviewRow[] = computed.rows.map((row) => ({
      rowNumber: row.rowNumber,
      idCell: row.idCell,
      match: row.match,
      cells: row.cells.map((cell) => {
        if (cell.error) return { analyteName: cell.analyteName, raw: cell.raw, verdict: { kind: "rejected", message: cell.error } };
        if (!cell.parsed) return { analyteName: cell.analyteName, raw: cell.raw, verdict: { kind: "rejected", message: "Not evaluated." } };
        const display = resultDisplay(cell.parsed);
        const target: ResultTarget | null =
          row.match.kind === "sample"
            ? { targetType: "sample", targetId: row.match.id }
            : row.match.kind === "qc"
              ? { targetType: "qc", targetId: row.match.materialId }
              : null;
        const existing = target && cell.analyteId ? current.get(cellKey(target, cell.analyteId)) : undefined;
        if (existing) {
          return {
            analyteName: cell.analyteName,
            raw: cell.raw,
            verdict: { kind: "conflict", display, existing: resultDisplay(existing.value) },
          };
        }
        return { analyteName: cell.analyteName, raw: cell.raw, verdict: { kind: "ok", display } };
      }),
    }));

    // Stage the exact bytes for confirm (one-use token; 30 min TTL).
    for (const [token, staged] of mockDb.pendingImports) {
      if (Date.now() - staged.createdAt > 30 * 60_000) mockDb.pendingImports.delete(token);
    }
    const token = `imp-tok-${crypto.randomUUID()}`;
    mockDb.pendingImports.set(token, {
      orgId: actor.orgId,
      actorEmail: actor.email,
      batchId,
      configId,
      fileName: file.fileName,
      bytes: new Uint8Array(file.bytes),
      createdAt: Date.now(),
    });

    return {
      status: "success",
      preview: {
        token,
        configId,
        configName: config.name,
        fileName: file.fileName,
        rows,
        notices: computed.notices,
        unitErrors: computed.unitErrors,
        conflictCount: rows.reduce(
          (n, r) => n + r.cells.filter((c) => c.verdict.kind === "conflict").length,
          0,
        ),
        unresolvedCount: rows.filter((r) => r.match.kind === "unknown" || r.match.kind === "out-of-batch").length,
      },
    };
  },

  async confirmImport(actor, batchId, token, resolutions, replaceCells, replaceAll, supersedeReason): Promise<BatchActionResult> {
    const loaded = loadForEntry(actor, batchId);
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const { batch, pinned } = loaded;

    const staged = mockDb.pendingImports.get(token);
    if (!staged || staged.orgId !== actor.orgId || staged.batchId !== batchId || staged.actorEmail !== actor.email) {
      return { status: "error", message: "The preview has expired — run the preview again." };
    }
    if (Date.now() - staged.createdAt > 30 * 60_000) {
      mockDb.pendingImports.delete(token);
      return { status: "error", message: "The preview has expired — run the preview again." };
    }
    const config = mockDb.importConfigs.get(staged.configId);
    if (!config) return { status: "error", message: "Unknown import configuration." };

    // Deterministic re-run on the SAME staged bytes — the stored event is
    // provably what was previewed and confirmed.
    const table = await readImportTable(config, staged.fileName, staged.bytes);
    if ("error" in table) return { status: "error", message: table.error };
    const computed = computeImport(batch, pinned, config, table);
    if ("error" in computed) return { status: "error", message: computed.error };

    const resolutionByRow = new Map(resolutions.map((r) => [r.rowNumber, r] as const));
    const replaceSet = new Set(replaceCells.map((c) => `${c.rowNumber}:${c.analyteName.toLowerCase()}`));
    const current = currentByCell(batch);

    // AC 4: every unmatched row must be resolved before anything is written.
    type PlannedWrite = {
      rowNumber: number;
      target: ResultTarget;
      analyteId: string;
      analyteName: string;
      value: ResultValue;
      raw: string;
      existing: MockMeasurementRecord | null;
      replace: boolean;
    };
    const writes: PlannedWrite[] = [];
    const rowOutcomes: ImportRowOutcome[] = [];
    let anyReplace = false;

    for (const row of computed.rows) {
      const resolution = resolutionByRow.get(row.rowNumber);
      let target: ResultTarget | null = null;
      let matchedLabel: string | null = null;
      let skipped: string | null = null;

      if (row.match.kind === "sample") {
        target = { targetType: "sample", targetId: row.match.id };
        matchedLabel = `sample:${row.match.id}`;
      } else if (row.match.kind === "qc") {
        target = { targetType: "qc", targetId: row.match.materialId };
        matchedLabel = `qc:${row.match.materialId}`;
      } else if (row.match.kind === "out-of-batch") {
        // Only skippable (AC 4).
        if (resolution?.action === "skip" && resolution.reason.trim()) {
          skipped = resolution.reason.trim();
        } else if (resolution?.action === "map") {
          return { status: "error", message: `Row ${row.rowNumber} (${row.idCell}) belongs to a sample outside this batch — it can only be skipped.` };
        } else {
          return { status: "error", message: `Row ${row.rowNumber} (${row.idCell}) is unresolved — skip it with a reason.` };
        }
      } else {
        // unknown: map or skip-with-reason (AC 4).
        if (resolution?.action === "map") {
          const targetOk =
            (resolution.target.targetType === "sample" && batch.sampleIds.includes(resolution.target.targetId)) ||
            (resolution.target.targetType === "qc" && batch.qc.some((e) => e.materialId === resolution.target.targetId));
          if (!targetOk) {
            return { status: "error", message: `Row ${row.rowNumber}: the mapped target is not in this batch.` };
          }
          target = resolution.target;
          matchedLabel = `${resolution.target.targetType}:${resolution.target.targetId}`;
        } else if (resolution?.action === "skip" && resolution.reason.trim()) {
          skipped = resolution.reason.trim();
        } else {
          return { status: "error", message: `Row ${row.rowNumber} (${row.idCell || "empty ID"}) is unresolved — map it or skip it with a reason (confirm stays blocked).` };
        }
      }

      const cellOutcomes: ImportCellOutcome[] = [];
      if (target && !skipped) {
        for (const cell of row.cells) {
          if (cell.error || !cell.parsed || !cell.analyteId) {
            cellOutcomes.push({ analyteName: cell.analyteName, raw: cell.raw, result: "rejected", reason: cell.error ?? "Not evaluated." });
            continue;
          }
          const existing = current.get(cellKey(target, cell.analyteId)) ?? null;
          const replace = existing !== null && (replaceAll || replaceSet.has(`${row.rowNumber}:${cell.analyteName.toLowerCase()}`));
          if (existing && !replace) {
            cellOutcomes.push({ analyteName: cell.analyteName, raw: cell.raw, result: "kept-existing", reason: "" });
            continue; // AC 7 default: keep existing
          }
          if (existing && replace) anyReplace = true;
          writes.push({
            rowNumber: row.rowNumber,
            target,
            analyteId: cell.analyteId,
            analyteName: cell.analyteName,
            value: cell.parsed,
            raw: cell.raw,
            existing,
            replace: existing !== null,
          });
          cellOutcomes.push({
            analyteName: cell.analyteName,
            raw: cell.raw,
            result: existing ? "superseded-existing" : "imported",
            reason: "",
          });
        }
      } else {
        for (const cell of row.cells) {
          cellOutcomes.push({ analyteName: cell.analyteName, raw: cell.raw, result: "rejected", reason: skipped ? `Row skipped: ${skipped}` : (cell.error ?? "") });
        }
      }

      rowOutcomes.push({
        rowNumber: row.rowNumber,
        idCell: row.idCell,
        matched: matchedLabel,
        outcome: skipped ? "skipped" : cellOutcomes.some((c) => c.result === "imported" || c.result === "superseded-existing") ? "imported" : "rejected",
        reason: skipped ?? (cellOutcomes.every((c) => c.result === "rejected") ? (cellOutcomes[0]?.reason ?? "") : ""),
        cells: cellOutcomes,
      });
    }

    if (anyReplace && !supersedeReason.trim()) {
      return { status: "error", message: "Replacing existing values requires a reason (recorded on each superseded value)." };
    }
    if (writes.length === 0) {
      return { status: "error", message: "Nothing to import — every cell is rejected, skipped or kept as-is." };
    }

    // AC 8: the event — file, checksum, frozen mapping, row outcomes — is
    // stored BEFORE any record is written.
    const eventId = `impev-${crypto.randomUUID()}`;
    const sha256 = createHash("sha256").update(staged.bytes).digest("hex");
    const importEvent: MockImportEvent = {
      id: eventId,
      at: new Date().toISOString(),
      by: actor.email,
      file: {
        id: `att-${eventId}`,
        fileName: staged.fileName,
        sizeBytes: staged.bytes.length,
        sha256,
        uploadedAt: new Date().toISOString(),
        uploadedBy: actor.email,
      },
      configId: config.id,
      configName: config.name,
      configSnapshot: JSON.stringify(config),
      supersedeReason: anyReplace ? supersedeReason.trim() : null,
      rows: rowOutcomes,
    };
    mockDb.batchFiles.set(`${batch.orgId}:import:${eventId}`, new Uint8Array(staged.bytes));
    batch.imports.push(importEvent);
    const importedCount = writes.filter((w) => !w.replace).length;
    const supersededCount = writes.filter((w) => w.replace).length;
    addEvent(
      batch,
      actor,
      "import-confirmed",
      `Import "${config.name}" — ${staged.fileName} (sha256 ${sha256.slice(0, 16)}…): ${importedCount} imported, ${supersededCount} replaced, ${rowOutcomes.filter((r) => r.outcome === "skipped").length} row(s) skipped`,
    );

    // AC 9: records with origin `import`, referencing the event (per-record
    // audit events ride appendRecord — AC 10).
    for (const write of writes) {
      appendRecord(
        batch,
        actor,
        write.target,
        write.analyteId,
        write.value,
        "import",
        null,
        eventId,
        write.existing,
        write.existing ? supersedeReason.trim() : null,
        rowLabelFor(batch, write.target),
        write.analyteName,
      );
    }
    mockDb.pendingImports.delete(token); // one-use
    return { status: "success", batchId };
  },

  // ---- US-D6: review & completion ------------------------------------------

  async reviewView(actor, batchId) {
    const grid = await mockBatchApi.resultsGrid(actor, batchId);
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!grid || !batch) return null;
    const method = mockDb.methods.get(batch.methodId);
    if (!method) return null;
    const pinned = methodVersionByNumber(method, batch.methodVersion);
    const { gaps, undecided, blockers } = completionState(batch, pinned);
    const reviewDenied = canReviewBatch(actor, batch);
    return {
      batchStatus: batch.status,
      columns: grid.columns,
      rows: grid.rows,
      cells: grid.cells,
      qualifiers: grid.qualifiers,
      qcExpectations: qcExpectationsFor(batch, pinned),
      gaps,
      undecidedCount: undecided,
      canReview: reviewDenied === null,
      reviewBlockedReason: reviewDenied,
      completeBlockers: blockers,
      amendmentFlagged: batch.results.some((r) => r.amendmentCheckRequired),
    };
  },

  async setResultValidity(actor, batchId, recordId, validity, reason): Promise<BatchActionResult> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId) return { status: "error", message: "Unknown batch." };
    if (batch.status !== "awaiting-review") {
      return { status: "error", message: "Decisions are made during review — this batch is not awaiting review." };
    }
    const denied = canReviewBatch(actor, batch);
    if (denied) return { status: "error", message: denied };
    if (validity !== "valid" && validity !== "rejected") {
      return { status: "error", message: "A result is set to valid or rejected." };
    }
    const record = batch.results.find((r) => r.id === recordId);
    if (!record) return { status: "error", message: "Unknown result record." };
    const current = currentByCell(batch).get(
      cellKey({ targetType: record.targetType, targetId: record.targetId }, record.analyteId),
    );
    if (current?.id !== record.id) {
      return { status: "error", message: "Only a cell's CURRENT value is decided — this record was superseded." };
    }
    if (validity === "rejected" && !reason.trim()) {
      return { status: "error", message: "Rejecting requires a reason — it anchors the nonconforming-work record (epic E)." };
    }
    const method = mockDb.methods.get(batch.methodId);
    if (!method) return { status: "error", message: "Unknown method." };
    decideRecord(batch, actor, record, methodVersionByNumber(method, batch.methodVersion), validity, reason.trim() || null);
    return { status: "success", batchId };
  },

  async validateAllUnflagged(actor, batchId): Promise<BatchActionResult> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId) return { status: "error", message: "Unknown batch." };
    if (batch.status !== "awaiting-review") {
      return { status: "error", message: "Decisions are made during review — this batch is not awaiting review." };
    }
    const denied = canReviewBatch(actor, batch);
    if (denied) return { status: "error", message: denied };
    const method = mockDb.methods.get(batch.methodId);
    if (!method) return { status: "error", message: "Unknown method." };
    const pinned = methodVersionByNumber(method, batch.methodVersion);
    // UI convenience only (AC 3): every result gets its OWN attributed status
    // transition and audit event.
    let decided = 0;
    for (const record of currentByCell(batch).values()) {
      if (record.validity !== "pending") continue;
      decideRecord(batch, actor, record, pinned, "valid", null);
      decided += 1;
    }
    if (decided === 0) return { status: "error", message: "No pending results — nothing to validate." };
    return { status: "success", batchId };
  },

  async closeGapNoResult(actor, batchId, target, analyteId, reason): Promise<BatchActionResult> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId) return { status: "error", message: "Unknown batch." };
    if (batch.status !== "awaiting-review") {
      return { status: "error", message: "Gaps are closed during review — this batch is not awaiting review." };
    }
    const denied = canReviewBatch(actor, batch);
    if (denied) return { status: "error", message: denied };
    // AC 4 covers (sample × analyte) cells; QC cells are judged by the human
    // reviewer and formalised in epic E.
    if (target.targetType !== "sample" || !batch.sampleIds.includes(target.targetId)) {
      return { status: "error", message: "Gap closure applies to this batch's sample cells." };
    }
    const method = mockDb.methods.get(batch.methodId);
    if (!method) return { status: "error", message: "Unknown method." };
    const pinned = methodVersionByNumber(method, batch.methodVersion);
    const analyte = pinned.analytes.find((a) => a.id === analyteId);
    if (!analyte) return { status: "error", message: "Unknown analyte for this batch's pinned method version." };
    if (currentByCell(batch).has(cellKey(target, analyteId))) {
      return { status: "error", message: "This cell already has a value — only empty cells are closed as no-result." };
    }
    if (!reason.trim()) return { status: "error", message: "Closing a gap as no-result requires a reason." };

    // The reviewer's explicit closure: a no-result record, decided valid in
    // the same act (it IS the decision), fully attributed.
    const record: MockMeasurementRecord = {
      id: `res-${crypto.randomUUID()}`,
      targetType: "sample",
      targetId: target.targetId,
      analyteId,
      methodId: batch.methodId,
      methodVersion: batch.methodVersion,
      value: { kind: "no-result", reason: reason.trim() },
      origin: "manual",
      worksheetVersion: null,
      importEventId: null,
      enteredBy: actor.email,
      enteredAt: new Date().toISOString(),
      supersedes: null,
      supersedeReason: null,
      validity: "valid",
      validitySetBy: actor.email,
      validitySetAt: new Date().toISOString(),
      validityReason: null,
      amendmentCheckRequired: false,
    };
    batch.results.push(record);
    addEvent(
      batch,
      actor,
      "result-entered",
      `Result ${target.targetId} · ${analyte.name}: no result — ${reason.trim()} (gap closed at review)`,
    );
    return { status: "success", batchId };
  },

  async completeBatch(actor, batchId): Promise<BatchActionResult> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId) return { status: "error", message: "Unknown batch." };
    if (batch.status !== "awaiting-review") {
      return { status: "error", message: "Only a batch awaiting review can be completed." };
    }
    const denied = canReviewBatch(actor, batch);
    if (denied) return { status: "error", message: denied };
    const method = mockDb.methods.get(batch.methodId);
    if (!method) return { status: "error", message: "Unknown method." };
    const pinned = methodVersionByNumber(method, batch.methodVersion);
    const { blockers } = completionState(batch, pinned);
    if (blockers.length > 0) {
      return { status: "error", message: `Completion blocked: ${blockers.join("; ")}.` };
    }
    const current = [...currentByCell(batch).values()];
    const valid = current.filter((r) => r.validity === "valid").length;
    const rejected = current.filter((r) => r.validity === "rejected").length;
    // AC 6/9: the completion record IS the approval act, and it is final —
    // corrections go through AC 8, a structural redo is a NEW batch. The
    // sample/job status cascade needs no code: it is all derived views.
    batch.status = "completed";
    addEvent(
      batch,
      actor,
      "batch-completed",
      `Batch completed — ${valid} result(s) valid, ${rejected} rejected (review approval)`,
    );
    return { status: "success", batchId };
  },

  async replaceCompletedResult(actor, batchId, target, analyteId, input, reason): Promise<BatchActionResult> {
    const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
    if (!batch || batch.orgId !== actor.orgId) return { status: "error", message: "Unknown batch." };
    if (batch.status !== "completed") {
      return { status: "error", message: "Post-completion replacement applies to completed batches only." };
    }
    const denied = canReviewBatch(actor, batch); // AC 8 authorization incl. segregation
    if (denied) return { status: "error", message: denied };
    if (!reason.trim()) {
      return { status: "error", message: "A post-completion replacement requires a reason (§7.8.8)." };
    }
    const method = mockDb.methods.get(batch.methodId);
    if (!method) return { status: "error", message: "Unknown method." };
    const pinned = methodVersionByNumber(method, batch.methodVersion);
    const targetError = validateTarget(batch, pinned, target, analyteId);
    if (targetError) return { status: "error", message: targetError };
    const validated = validateResultInput(batch.orgId, input);
    if ("error" in validated) return { status: "error", message: validated.error };
    const existing = currentByCell(batch).get(cellKey(target, analyteId));
    if (!existing) {
      return { status: "error", message: "This cell holds no value to replace." };
    }

    const analyteName = pinned.analytes.find((a) => a.id === analyteId)?.name ?? analyteId;
    const record: MockMeasurementRecord = {
      id: `res-${crypto.randomUUID()}`,
      targetType: target.targetType,
      targetId: target.targetId,
      analyteId,
      methodId: batch.methodId,
      methodVersion: batch.methodVersion,
      value: validated.value,
      origin: "manual",
      worksheetVersion: null,
      importEventId: null,
      enteredBy: actor.email,
      enteredAt: new Date().toISOString(),
      supersedes: existing.id,
      supersedeReason: reason.trim(),
      // The replacing manager's act is the decision; the original stays
      // visible with its own status.
      validity: "valid",
      validitySetBy: actor.email,
      validitySetAt: new Date().toISOString(),
      validityReason: null,
      // AC 8 §7.8.8 trigger — conservative in the MVP: EVERY post-completion
      // replacement flags "amendment check required"; epic F refines this to
      // actual issued-report linkage and consumes it.
      amendmentCheckRequired: true,
    };
    batch.results.push(record);
    addEvent(
      batch,
      actor,
      "result-superseded",
      `Post-completion replacement ${rowLabelFor(batch, target)} · ${analyteName}: ${resultDisplay(existing.value)} → ${resultDisplay(validated.value)} — ${reason.trim()} · report impact: amendment check required (§7.8.8)`,
    );
    return { status: "success", batchId };
  },
};

// ---- US-D6: review & completion ---------------------------------------------

/** AC 2: Admin/Lab manager — and when the per-lab segregation setting is on,
 * a participant (completed a step, entered or imported any result) cannot
 * review, complete or post-completion-replace. Enforced server-side. */
function canReviewBatch(actor: BatchActor, batch: MockBatch): string | null {
  const denied = canManageBatch(actor, batch.labId);
  if (denied) return denied;
  const lab = mockDb.labs.get(batch.labId);
  if (lab?.reviewerMustDiffer) {
    const participated =
      batch.events.some((e) => e.type === "step-completed" && e.by === actor.email) ||
      batch.results.some((r) => r.enteredBy === actor.email);
    if (participated) {
      return "This lab requires the reviewer to differ from the performing analyst(s) — you completed steps or entered results on this batch (per-lab setting, US-A7).";
    }
  }
  return null;
}

/** AC 1: the exact lot's expectation per QC cell (US-B2 AC 3), or the blank's
 * reporting limit — context for the HUMAN judgement; no verdict until epic E. */
function qcExpectationsFor(batch: MockBatch, pinned: MethodVersion): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of batch.qc) {
    const material = mockDb.qcMaterials.get(entry.materialId);
    if (!material) continue;
    for (const analyte of pinned.analytes) {
      const key = `${entry.materialId}:${analyte.id}`;
      if (material.type === "blank") {
        out[key] = analyte.loq
          ? `expected < LOQ (${analyte.loq}${analyte.unit ? ` ${analyte.unit}` : ""})`
          : "expected below reporting limit (no LOQ set on this analyte)";
        continue;
      }
      const expected = material.expectedValues.find(
        (v) =>
          v.analyteName.trim().toLowerCase() === analyte.name.trim().toLowerCase() &&
          (v.unit?.trim().toLowerCase() ?? null) === (analyte.unit?.trim().toLowerCase() ?? null),
      );
      if (expected) {
        const tolerance =
          expected.tolerance.kind === "percent"
            ? `±${expected.tolerance.value}%`
            : `±${expected.tolerance.value}${analyte.unit ? ` ${analyte.unit}` : ""}`;
        out[key] = `expected ${expected.expectedValue}${analyte.unit ? ` ${analyte.unit}` : ""} ${tolerance} (lot ${material.lotNumber})`;
      }
    }
  }
  return out;
}

/** AC 4/6 — the completion gate: no unaccounted sample-cell gap, no current
 * record still pending. A current REJECTED value stands as rejected-with-
 * reason (AC 5); superseded records are history and never block. */
function completionState(batch: MockBatch, pinned: MethodVersion) {
  const current = currentByCell(batch);
  const gaps: { targetId: string; label: string; analyteId: string; analyteName: string }[] = [];
  for (const sampleId of batch.sampleIds) {
    for (const analyte of pinned.analytes) {
      if (!current.has(`sample:${sampleId}:${analyte.id}`)) {
        gaps.push({ targetId: sampleId, label: sampleId, analyteId: analyte.id, analyteName: analyte.name });
      }
    }
  }
  let undecided = 0;
  for (const record of current.values()) {
    if (record.validity === "pending") undecided += 1;
  }
  const blockers: string[] = [];
  if (gaps.length > 0) {
    blockers.push(`${gaps.length} sample cell(s) without a result — fill via set-back or close as no-result + reason`);
  }
  if (undecided > 0) blockers.push(`${undecided} result(s) still awaiting a valid/rejected decision`);
  return { gaps, undecided, blockers };
}

function decideRecord(
  batch: MockBatch,
  actor: BatchActor,
  record: MockMeasurementRecord,
  pinned: MethodVersion,
  validity: "valid" | "rejected",
  reason: string | null,
): void {
  record.validity = validity;
  record.validitySetBy = actor.email;
  record.validitySetAt = new Date().toISOString();
  record.validityReason = validity === "rejected" ? reason : null;
  const analyteName = pinned.analytes.find((a) => a.id === record.analyteId)?.name ?? record.analyteId;
  const rowLabel = rowLabelFor(batch, { targetType: record.targetType, targetId: record.targetId });
  addEvent(
    batch,
    actor,
    "result-validity",
    `Result ${rowLabel} · ${analyteName} (${resultDisplay(record.value)}): ${validity}${validity === "rejected" ? ` — ${reason}` : ""}`,
  );
}

// ---- US-D5: instrument import ----------------------------------------------

function canManageConfigs(actor: BatchActor, labId: string): string | null {
  if (actor.role !== "admin" && actor.role !== "lab-manager") {
    return "Only Admins and Lab managers manage import configurations.";
  }
  if (actor.role === "admin" || actor.isSupport) return null;
  return actor.labs.includes(labNameById(labId))
    ? null
    : "You can only manage import configurations in your own lab(s).";
}

function validateConfigInput(actor: BatchActor, input: ImportConfigInput): string | null {
  if (!input.name.trim()) return "The configuration needs a name.";
  const lab = mockDb.labs.get(input.labId);
  if (!lab || lab.orgId !== actor.orgId) return "Choose the lab this configuration belongs to.";
  if (input.fileType !== "csv" && input.fileType !== "excel") return "Choose the file type.";
  if (input.orientation !== "wide" && input.orientation !== "long") return "Choose the orientation.";
  if (input.decimalSeparator !== "comma" && input.decimalSeparator !== "point") {
    return "Declare the decimal separator (ADR-4: declared, never auto-detected).";
  }
  if (!["comma", "semicolon", "tab"].includes(input.csvDelimiter)) return "Declare the CSV delimiter.";
  if (!input.idColumn.trim()) return "Name the column that carries the sample/QC ID.";
  if (input.orientation === "wide") {
    if (input.columns.length < 1) return "Map at least one analyte column.";
    const seen = new Set<string>();
    for (const c of input.columns) {
      if (!c.header.trim()) return "Every mapped column needs its file header.";
      if (!c.analyteName.trim()) return "Every mapped column needs an analyte name.";
      if (c.unit !== null && !c.unit.trim()) {
        return `Column "${c.header}": enter a unit or mark it explicitly as "no unit".`;
      }
      const key = c.header.trim().toLowerCase();
      if (seen.has(key)) return `Column "${c.header}" is mapped twice.`;
      seen.add(key);
    }
  } else {
    if (!input.analyteColumn.trim()) return "Name the analyte column (long orientation).";
    if (!input.valueColumn.trim()) return "Name the value column (long orientation).";
    const seen = new Set<string>();
    for (const u of input.longUnits) {
      if (!u.analyteName.trim()) return "Every unit row needs an analyte name.";
      if (u.unit !== null && !u.unit.trim()) {
        return `Analyte "${u.analyteName}": enter a unit or mark it explicitly as "no unit".`;
      }
      const key = u.analyteName.trim().toLowerCase();
      if (seen.has(key)) return `Analyte "${u.analyteName}" has two unit declarations.`;
      seen.add(key);
    }
  }
  return null;
}

/** Read the file into a raw string table — CSV via our strict parser, Excel
 * via exceljs extracting cell TEXT only (decision 4 Jul 2026: the library
 * never interprets values; ADR-4 validation stays the only judge). */
async function readImportTable(
  config: MockImportConfig,
  fileName: string,
  bytes: Uint8Array,
): Promise<ParsedTable | { error: string }> {
  if (config.fileType === "csv") {
    if (/\.xlsx?$/i.test(fileName)) {
      return { error: "This configuration reads CSV, but the file looks like Excel — pick the matching configuration." };
    }
    return parseCsv(Buffer.from(bytes).toString("utf8"), config.csvDelimiter);
  }
  if (!/\.xlsx$/i.test(fileName)) {
    return { error: "This configuration reads Excel (.xlsx) — pick the matching configuration for CSV files." };
  }
  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return { error: "The workbook contains no sheets." };
    const rows: string[][] = [];
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) {
        cells.push(String(row.getCell(c).text ?? "").trim());
      }
      if (cells.some((cell) => cell !== "")) rows.push(cells);
    }
    if (rows.length < 2) return { error: "The sheet has no data rows under the header." };
    const [header, ...data] = rows;
    return { header, rows: data };
  } catch {
    return { error: "The Excel file could not be read — is it a valid .xlsx export?" };
  }
}

type ComputedCell = {
  analyteName: string;
  analyteId: string | null;
  raw: string;
  parsed: ResultValue | null;
  error: string | null; // rejection reason (unit mismatch, unparseable, duplicate)
};

type ComputedRow = {
  rowNumber: number;
  idCell: string;
  match: ImportPreviewRow["match"];
  cells: ComputedCell[];
};

/** The deterministic core shared by preview and confirm: file table + config
 * + batch → matched rows with per-cell verdicts (AC 4/5/6). */
function computeImport(
  batch: MockBatch,
  pinned: MethodVersion,
  config: MockImportConfig,
  table: ParsedTable,
): { rows: ComputedRow[]; notices: string[]; unitErrors: string[] } | { error: string } {
  const notices: string[] = [];
  const unitErrors: string[] = [];
  const headerIndex = new Map(table.header.map((h, i) => [h.trim().toLowerCase(), i] as const));
  const col = (name: string) => headerIndex.get(name.trim().toLowerCase());

  const idIdx = col(config.idColumn);
  if (idIdx === undefined) {
    return { error: `The ID column "${config.idColumn}" is not in the file header (${table.header.join(", ")}).` };
  }

  const unitMatches = (declared: string | null, methodUnit: string | null) =>
    (declared?.trim().toLowerCase() || null) === (methodUnit?.trim().toLowerCase() || null);
  const analyteByName = (name: string) =>
    pinned.analytes.find((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null;

  // Column plan (wide) / unit plan (long) with the AC 6 unit guard.
  type WidePlan = { header: string; index: number | undefined; analyteName: string; analyteId: string | null; unitError: string | null };
  const widePlan: WidePlan[] = [];
  if (config.orientation === "wide") {
    for (const mapping of config.columns) {
      const analyte = analyteByName(mapping.analyteName);
      let unitError: string | null = null;
      if (!analyte) {
        notices.push(`Column "${mapping.header}" (${mapping.analyteName}) has no matching analyte on this method — ignored.`);
      } else if (!unitMatches(mapping.unit, analyte.unit)) {
        unitError = `Column "${mapping.header}": configured unit "${mapping.unit ?? "no unit"}" ≠ method unit "${analyte.unit ?? "no unit"}" — all its cells rejected (factor-1000 guard).`;
        unitErrors.push(unitError);
      }
      const index = col(mapping.header);
      if (index === undefined && analyte) {
        notices.push(`Column "${mapping.header}" is not in the file header — its analyte stays empty.`);
      }
      widePlan.push({ header: mapping.header, index, analyteName: mapping.analyteName, analyteId: analyte?.id ?? null, unitError });
    }
  }
  let longIdx: { analyte: number; value: number } | null = null;
  const longUnitErrors = new Map<string, string>(); // analyteName(lc) → error
  if (config.orientation === "long") {
    const a = col(config.analyteColumn);
    const v = col(config.valueColumn);
    if (a === undefined || v === undefined) {
      return { error: `The analyte/value columns ("${config.analyteColumn}", "${config.valueColumn}") are not both in the file header.` };
    }
    longIdx = { analyte: a, value: v };
    for (const u of config.longUnits) {
      const analyte = analyteByName(u.analyteName);
      if (analyte && !unitMatches(u.unit, analyte.unit)) {
        const message = `Analyte "${u.analyteName}": configured unit "${u.unit ?? "no unit"}" ≠ method unit "${analyte.unit ?? "no unit"}" — its cells rejected (factor-1000 guard).`;
        longUnitErrors.set(u.analyteName.trim().toLowerCase(), message);
        unitErrors.push(message);
      }
    }
  }

  // Row matching (AC 4).
  const sampleById = new Map(batch.sampleIds.map((id) => [id.toLowerCase(), id] as const));
  const qcByCode = new Map(
    batch.qc.map((e) => {
      const code = mockDb.qcMaterials.get(e.materialId)?.code ?? e.materialId;
      return [code.toLowerCase(), { materialId: e.materialId, code }] as const;
    }),
  );
  const matchRow = (idCell: string): ImportPreviewRow["match"] => {
    const key = idCell.trim().toLowerCase();
    const sample = sampleById.get(key);
    if (sample) return { kind: "sample", id: sample };
    const qc = qcByCode.get(key);
    if (qc) return { kind: "qc", materialId: qc.materialId, code: qc.code };
    // An ID that belongs to a sample OUTSIDE this batch is shown as such and
    // can only be skipped (AC 4).
    for (const job of mockDb.jobs.values()) {
      if (job.orgId !== batch.orgId) continue;
      const found = job.samples.find((s) => s.id.toLowerCase() === key);
      if (found) return { kind: "out-of-batch", sampleId: found.id };
    }
    return { kind: "unknown" };
  };

  // Long orientation: group measurement rows per file row but evaluate each
  // (row, analyte, value) as one cell.
  const seenCellsInFile = new Set<string>(); // duplicate guard (decision 4 Jul 2026)
  const unknownLongAnalytes = new Map<string, number>();
  const rows: ComputedRow[] = table.rows.map((cells, i) => {
    const idCell = (cells[idIdx] ?? "").trim();
    const match = matchRow(idCell);
    const target: ResultTarget | null =
      match.kind === "sample"
        ? { targetType: "sample", targetId: match.id }
        : match.kind === "qc"
          ? { targetType: "qc", targetId: match.materialId }
          : null;

    const computed: ComputedCell[] = [];
    const evaluate = (analyteName: string, analyteId: string | null, raw: string, unitError: string | null) => {
      if (raw.trim() === "") return; // empty cells simply stay empty
      const cell: ComputedCell = { analyteName, analyteId, raw, parsed: null, error: null };
      if (unitError) {
        cell.error = unitError;
      } else if (!analyteId) {
        cell.error = "No matching analyte on this method — ignored.";
      } else {
        const parsed = parseImportCell(raw, config.decimalSeparator);
        if (!parsed.ok) {
          cell.error = parsed.message;
        } else if (target) {
          const dupKey = `${target.targetType}:${target.targetId}:${analyteId}`;
          if (seenCellsInFile.has(dupKey)) {
            cell.error = "Duplicate row for this entry — the first row was kept (QC position bookkeeping is post-MVP).";
          } else {
            seenCellsInFile.add(dupKey);
            cell.parsed = parsed.value;
          }
        } else {
          cell.parsed = parsed.value; // unmatched row: parse verdict still shown
        }
      }
      computed.push(cell);
    };

    if (config.orientation === "wide") {
      for (const plan of widePlan) {
        if (plan.index === undefined) continue;
        evaluate(plan.analyteName, plan.analyteId, (cells[plan.index] ?? "").trim(), plan.unitError);
      }
    } else if (longIdx) {
      const analyteName = (cells[longIdx.analyte] ?? "").trim();
      const raw = (cells[longIdx.value] ?? "").trim();
      if (analyteName) {
        const analyte = analyteByName(analyteName);
        if (!analyte) {
          unknownLongAnalytes.set(analyteName, (unknownLongAnalytes.get(analyteName) ?? 0) + 1);
        }
        evaluate(
          analyteName,
          analyte?.id ?? null,
          raw,
          longUnitErrors.get(analyteName.trim().toLowerCase()) ?? null,
        );
      }
    }
    return { rowNumber: i + 1, idCell, match, cells: computed };
  });

  for (const [name, count] of unknownLongAnalytes) {
    notices.push(`Analyte "${name}" (${count} row(s)) is not on this method — ignored (instruments often measure more than the method reports).`);
  }
  // AC 4: all rows with one QC code attach to that entry; count vs quantity
  // is a notice, never a block.
  for (const entry of batch.qc) {
    const code = mockDb.qcMaterials.get(entry.materialId)?.code ?? entry.materialId;
    const rowCount = rows.filter((r) => r.match.kind === "qc" && r.match.materialId === entry.materialId).length;
    if (rowCount > 0 && rowCount !== entry.quantity) {
      notices.push(`${code}: ${rowCount} row(s) in the file vs quantity ×${entry.quantity} on the batch.`);
    }
  }
  return { rows, notices, unitErrors };
}

/** US-D2 AC 4: the distinct step names across the lab's ACTIVE methods
 * (current versions) — "what is waiting at Digestion". */
export function stepNameOptionsForLab(orgId: string, labId: string): string[] {
  const names = new Set<string>();
  for (const method of mockDb.methods.values()) {
    if (method.orgId !== orgId || method.status !== "active") continue;
    const current = currentMethodVersion(method);
    if (current.labId !== labId) continue;
    for (const step of current.steps) names.add(step.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** US-D2 AC 8: the org users a manager may assign this batch to — everyone
 * allowed to work on it under the US-D3 rule. */
export function assignableUsersForBatch(
  orgId: string,
  batchId: string,
): { email: string; name: string }[] {
  const batch = mockDb.batches.get(batchKey(orgId, batchId));
  if (!batch) return [];
  const out: { email: string; name: string }[] = [];
  for (const user of mockDb.users.values()) {
    const targetActor = actorForOrgUser(orgId, user.email);
    if (!targetActor) continue;
    if (canWorkBatch(targetActor, batch) === null) out.push({ email: user.email, name: user.name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---- US-D4: the results grid (the first ADR-2 records) ---------------------

function cellKey(target: ResultTarget, analyteId: string): string {
  return `${target.targetType}:${target.targetId}:${analyteId}`;
}

/** Human form of a value for events/previews — never a substitute for the
 * stored record. */
export function resultDisplay(value: ResultValue): string {
  switch (value.kind) {
    case "numeric":
      return value.value;
    case "censored":
      return `${value.qualifier}${value.boundary}`;
    case "qualifier":
      return value.label;
    case "text":
      return value.text;
    case "no-result":
      return "no result";
  }
}

/** Entry window (AC 1/10): from creation until Awaiting review; never on a
 * voided or completed batch. Returns the human reason when closed. */
function entryClosed(batch: MockBatch): string | null {
  if (batch.status === "open") return null;
  if (batch.status === "awaiting-review") {
    return "Entry is closed during review — the reviewer judges a stable snapshot; a set-back (US-D3) reopens it.";
  }
  return batch.status === "voided"
    ? "This batch is voided — its records are frozen."
    : "This batch is completed — its records are frozen.";
}

function validateTarget(
  batch: MockBatch,
  pinned: MethodVersion,
  target: ResultTarget,
  analyteId: string,
): string | null {
  if (!pinned.analytes.some((a) => a.id === analyteId)) {
    return "Unknown analyte for this batch's pinned method version.";
  }
  if (target.targetType === "sample") {
    return batch.sampleIds.includes(target.targetId) ? null : "That sample is not in this batch.";
  }
  if (target.targetType === "qc") {
    return batch.qc.some((e) => e.materialId === target.targetId)
      ? null
      : "That QC entry is not in this batch.";
  }
  return "Invalid result target.";
}

/** AC 2/3/5 — turn raw form input into a stored ResultValue, or refuse. */
function validateResultInput(orgId: string, input: ResultValueInput): { value: ResultValue } | { error: string } {
  switch (input.kind) {
    case "numeric": {
      const parsed = parseNumericInput(input.raw);
      return parsed.ok ? { value: { kind: "numeric", value: parsed.canonical } } : { error: parsed.message };
    }
    case "censored": {
      if (input.qualifier !== "<" && input.qualifier !== ">") {
        return { error: "A censored value uses < or >." };
      }
      const parsed = parseNumericInput(input.boundaryRaw);
      if (!parsed.ok) return { error: `Boundary: ${parsed.message}` };
      return { value: { kind: "censored", qualifier: input.qualifier, boundary: parsed.canonical } };
    }
    case "qualifier": {
      // New records may only use ACTIVE list entries; historical records keep
      // their snapshotted label regardless of later deactivation (AC 3).
      const entry = getOrgSettings(orgId).resultQualifiers.find((q) => q.id === input.qualifierId);
      if (!entry) return { error: "Unknown qualifier." };
      if (!entry.active) return { error: `The qualifier "${entry.name}" is deactivated — pick an active one.` };
      return { value: { kind: "qualifier", qualifierId: entry.id, label: entry.name } };
    }
    case "text": {
      const text = input.text.trim();
      if (!text) return { error: "Enter the qualitative result text." };
      if (text.length > 200) return { error: "Qualitative text is limited to 200 characters." };
      return { value: { kind: "text", text } };
    }
    case "no-result": {
      const reason = input.reason.trim();
      if (!reason) return { error: "A no-result requires a reason (it closes this cell out)." };
      return { value: { kind: "no-result", reason } };
    }
    default:
      return { error: "Invalid result input." };
  }
}

/** Newest record per cell — the current value is a pure view (decision). */
function currentByCell(batch: MockBatch): Map<string, MockMeasurementRecord> {
  const map = new Map<string, MockMeasurementRecord>();
  for (const record of batch.results) {
    // results[] is append-only in entry order: later wins.
    map.set(cellKey({ targetType: record.targetType, targetId: record.targetId }, record.analyteId), record);
  }
  return map;
}

function appendRecord(
  batch: MockBatch,
  actor: BatchActor,
  target: ResultTarget,
  analyteId: string,
  value: ResultValue,
  origin: MockMeasurementRecord["origin"],
  worksheetVersion: number | null,
  importEventId: string | null,
  supersedes: MockMeasurementRecord | null,
  supersedeReason: string | null,
  rowLabel: string,
  analyteName: string,
): void {
  const record: MockMeasurementRecord = {
    id: `res-${crypto.randomUUID()}`,
    targetType: target.targetType,
    targetId: target.targetId,
    analyteId,
    methodId: batch.methodId,
    methodVersion: batch.methodVersion,
    value,
    origin,
    worksheetVersion,
    importEventId,
    enteredBy: actor.email,
    enteredAt: new Date().toISOString(),
    supersedes: supersedes?.id ?? null,
    supersedeReason,
    validity: "pending", // US-D6 owns the transition
    validitySetBy: null,
    validitySetAt: null,
    validityReason: null,
    amendmentCheckRequired: false,
  };
  batch.results.push(record); // append-only — nothing is ever altered
  addEvent(
    batch,
    actor,
    supersedes ? "result-superseded" : "result-entered",
    supersedes
      ? `Result ${rowLabel} · ${analyteName}: ${resultDisplay(supersedes.value)} → ${resultDisplay(value)} — ${supersedeReason} (${origin})`
      : `Result ${rowLabel} · ${analyteName}: ${resultDisplay(value)} (${origin})`,
  );
}

/** Shared raw-cell interpretation for paste (AC 13) and worksheet (AC 14):
 * "<x"/">x" → censored, an active org-qualifier label → qualifier, otherwise
 * numeric under the full AC 5 rules. Text / no-result stay manual-only. */
function interpretRawCell(orgId: string, raw: string): ResultValueInput | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Empty cell." };
  if (trimmed.startsWith("<") || trimmed.startsWith(">")) {
    return {
      kind: "censored",
      qualifier: trimmed[0] as "<" | ">",
      boundaryRaw: trimmed.slice(1).trim(),
    };
  }
  const qualifier = getOrgSettings(orgId).resultQualifiers.find(
    (q) => q.active && q.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (qualifier) return { kind: "qualifier", qualifierId: qualifier.id };
  return { kind: "numeric", raw: trimmed };
}

function rowLabelFor(batch: MockBatch, target: ResultTarget): string {
  if (target.targetType === "sample") return target.targetId;
  const entry = batch.qc.find((e) => e.materialId === target.targetId);
  const code = mockDb.qcMaterials.get(target.targetId)?.code ?? target.targetId;
  return entry && entry.quantity > 1 ? `${code} ×${entry.quantity}` : code;
}

/** Parse the latest worksheet's Results sheet (AC 14). The mock reads the
 * CSV convention (ID column + one column per analyte — US-B1 AC 6); the real
 * backend reads the same convention from the XLSX Results sheet. */
function parseWorksheetEntries(
  batch: MockBatch,
  pinned: MethodVersion,
): { entries: BulkEntry[]; notices: string[]; worksheetVersion: number } | { error: string } {
  if (batch.worksheets.length === 0) {
    return { error: "No worksheet attached yet — upload it on the Files tab first." };
  }
  const latest = batch.worksheets[batch.worksheets.length - 1];
  const bytes = mockDb.batchFiles.get(`${batch.orgId}:ws:${latest.id}`);
  if (!bytes) {
    return { error: "The worksheet file is not readable (seed demo) — enter results manually or via paste." };
  }
  const text = Buffer.from(bytes).toString("utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { error: "No readable Results sheet in the worksheet — falling back to manual entry or paste." };
  }
  // Delimiter: whichever splits the header into the most cells.
  const delimiter = ["\t", ";", ","].sort(
    (a, b) => lines[0].split(b).length - lines[0].split(a).length,
  )[0];
  const header = lines[0].split(delimiter).map((h) => h.trim());
  const notices: string[] = [];

  // Header columns after the first map to analytes by name (ci), a
  // " (unit)" suffix tolerated.
  const columnAnalytes: (string | null)[] = header.slice(1).map((h) => {
    const name = h.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase();
    return pinned.analytes.find((a) => a.name.trim().toLowerCase() === name)?.id ?? null;
  });
  if (!columnAnalytes.some((id) => id !== null)) {
    return { error: "No readable Results sheet: no column matches this method's analytes — falling back to manual entry or paste." };
  }
  const ignored = header.slice(1).filter((_, i) => columnAnalytes[i] === null);
  if (ignored.length > 0) notices.push(`Ignored columns (no matching analyte): ${ignored.join(", ")}`);

  const sampleIds = new Map(batch.sampleIds.map((id) => [id.toLowerCase(), id] as const));
  const qcByCode = new Map(
    batch.qc.map((e) => [(mockDb.qcMaterials.get(e.materialId)?.code ?? "").toLowerCase(), e.materialId] as const),
  );
  const entries: BulkEntry[] = [];
  let unknownRows = 0;
  for (const line of lines.slice(1)) {
    const cells = line.split(delimiter).map((c) => c.trim());
    const rowId = cells[0]?.toLowerCase() ?? "";
    const target: ResultTarget | null = sampleIds.has(rowId)
      ? { targetType: "sample", targetId: sampleIds.get(rowId)! }
      : qcByCode.has(rowId)
        ? { targetType: "qc", targetId: qcByCode.get(rowId)! }
        : null;
    if (!target) {
      unknownRows += 1;
      continue;
    }
    columnAnalytes.forEach((analyteId, i) => {
      const raw = cells[i + 1] ?? "";
      if (analyteId && raw.trim() !== "") entries.push({ target, analyteId, raw });
    });
  }
  if (unknownRows > 0) notices.push(`${unknownRows} row(s) match no sample or QC code of this batch and were ignored.`);
  if (entries.length === 0) {
    return { error: "The Results sheet contains no values for this batch — falling back to manual entry or paste." };
  }
  return { entries, notices, worksheetVersion: batch.worksheets.length };
}

/** AC 5/13: per-cell verdicts for a set of raw entries — never writes. */
function previewEntries(batch: MockBatch, pinned: MethodVersion, entries: BulkEntry[]): BulkPreviewCell[] {
  const current = currentByCell(batch);
  const seen = new Set<string>();
  return entries.map((entry) => {
    const base = {
      target: entry.target,
      rowLabel: rowLabelFor(batch, entry.target),
      analyteId: entry.analyteId,
      raw: entry.raw,
    };
    const targetError = validateTarget(batch, pinned, entry.target, entry.analyteId);
    if (targetError) return { ...base, outcome: { kind: "rejected" as const, message: targetError } };
    const key = cellKey(entry.target, entry.analyteId);
    if (seen.has(key)) {
      return { ...base, outcome: { kind: "rejected" as const, message: "Duplicate cell in the block." } };
    }
    seen.add(key);
    // Occupied cells are never overwritten by a bulk flow — a correction
    // needs its own reason (AC 8; decision 4 Jul 2026).
    if (current.has(key)) return { ...base, outcome: { kind: "occupied" as const } };
    const input = interpretRawCell(batch.orgId, entry.raw);
    if ("error" in input) return { ...base, outcome: { kind: "rejected" as const, message: input.error } };
    const validated = validateResultInput(batch.orgId, input);
    if ("error" in validated) return { ...base, outcome: { kind: "rejected" as const, message: validated.error } };
    return { ...base, outcome: { kind: "accepted" as const, display: resultDisplay(validated.value) } };
  });
}

/** Load-and-gate shared by all entry mutations. */
function loadForEntry(
  actor: BatchActor,
  batchId: string,
): { batch: MockBatch; pinned: MethodVersion } | { error: string } {
  const batch = mockDb.batches.get(batchKey(actor.orgId, batchId));
  if (!batch || batch.orgId !== actor.orgId) return { error: "Unknown batch." };
  const denied = canWorkBatch(actor, batch);
  if (denied) return { error: denied };
  const closed = entryClosed(batch);
  if (closed) return { error: closed };
  const method = mockDb.methods.get(batch.methodId);
  if (!method) return { error: "Unknown method." };
  return { batch, pinned: methodVersionByNumber(method, batch.methodVersion) };
}

/** US-C3 AC 10 / US-D3 AC 1: the batches containing any of a job's samples,
 * for the job detail's Batches tab. Same-org only (invariant 5). */
export function batchesForJobSamples(
  orgId: string,
  sampleIds: string[],
): {
  id: string;
  methodLabel: string;
  methodVersion: number;
  status: MockBatch["status"];
  statusLabel: string;
  containedSampleIds: string[];
}[] {
  const wanted = new Set(sampleIds);
  const out: ReturnType<typeof batchesForJobSamples> = [];
  for (const b of mockDb.batches.values()) {
    if (b.orgId !== orgId) continue;
    const containedSampleIds = b.sampleIds.filter((id) => wanted.has(id));
    if (containedSampleIds.length === 0) continue;
    const method = mockDb.methods.get(b.methodId);
    const pinned = method ? methodVersionByNumber(method, b.methodVersion) : null;
    out.push({
      id: b.id,
      methodLabel: pinned ? methodLabel(pinned) : b.methodId,
      methodVersion: b.methodVersion,
      status: b.status,
      statusLabel: pinned ? statusLabelFor(b, pinned) : b.status,
      containedSampleIds,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

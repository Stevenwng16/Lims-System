import { createHash } from "node:crypto";
import {
  currentMethodVersion,
  getOrgSettings,
  mockDb,
  type MethodStep,
  type MethodVersion,
  type MockBatch,
  type MockBatchEvent,
  type MockJob,
  type MockMethod,
  type MockSample,
  type QcType,
} from "@/lib/mock-db";
import { equipmentAvailability } from "@/lib/equipment";
import { generateBatchNumber } from "@/lib/jobs/ids";
import { sampleCanBatch } from "@/lib/jobs/types";
import { qcMaterialsForMethod } from "@/lib/qc";
import { openBatchOfMethodContaining, sampleMethodProgress } from "./progress";
import type {
  BatchActionResult,
  BatchActor,
  BatchApi,
  BatchCompositionInput,
  BatchDetail,
  BatchListRow,
  EligibleSample,
  EquipmentOption,
  MethodBatchOptions,
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
        return {
          id: b.id,
          methodLabel: pinned ? methodLabel(pinned) : b.methodId,
          methodVersion: b.methodVersion,
          stepName: pinned?.steps[b.currentStepIndex]?.name ?? `Step ${b.currentStepIndex + 1}`,
          status: b.status,
          statusLabel: pinned ? statusLabelFor(b, pinned) : b.status,
          deadline: batchDeadline(b),
          sampleCount: b.sampleIds.length,
          qcPositions: qcPositions(b),
          maxPositions: pinned?.maxSamplesPerBatch ?? 0,
          compositionLatched: b.compositionLatched,
          createdAt: b.createdAt,
          createdBy: b.createdBy,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
      sampleIds: validated.sampleIds,
      qc: validated.qc,
      workingCopy: null,
      worksheets: [], // US-D4 AC 9 versions; gates the final step (US-D3 AC 5)
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
};

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

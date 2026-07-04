import type { Attachment, MockBatch, MockBatchEvent, SampleAcceptance } from "@/lib/mock-db";
import type { OrgRole } from "@/lib/permissions";

// Batch operations of US-D1 (creation/composition) and US-D3 (step workflow,
// set-back, void). Mock behind an interface, real backend plugs in later.
// US-D4 (data entry), US-D5 (import), US-D6 (review/completion) and US-D2
// (work queue) extend this module.

export type BatchActor = {
  email: string;
  role: OrgRole;
  labs: string[]; // lab NAMES the user is assigned to
  orgId: string;
  isSupport: boolean;
};

export type BatchCompositionInput = {
  sampleIds: string[];
  /** AC 5: sample ids the user EXPLICITLY confirmed for a method they did not
   * request — confirming adds the method to the sample's requested list. */
  confirmAddMethod: string[];
  qc: { materialId: string; quantity: number }[];
};

export type CreateBatchInput = BatchCompositionInput & {
  labId: string; // the active lab (work screen, US-A3 AC 4)
  methodId: string;
};

/** A sample the picker can offer (already filtered to AC 3 eligibility). */
export type EligibleSample = {
  id: string;
  jobId: string;
  customer: string;
  typeName: string;
  description: string;
  acceptance: SampleAcceptance; // accepted | accepted-with-reservation
  requested: boolean; // requested methods include the batch's method (AC 5)
};

/** Everything the New-batch form needs for ONE selectable method. */
export type MethodBatchOptions = {
  methodId: string;
  label: string; // "Name (CODE) — v3"
  version: number;
  maxPositions: number; // US-B1 AC 5 — samples + QC positions (AC 6)
  firstStepName: string;
  hasTemplate: boolean;
  eligibleSamples: EligibleSample[];
  qcOptions: {
    materialId: string;
    code: string;
    name: string;
    typeLabel: string;
    lotNumber: string;
    expiryDate: string;
  }[];
};

export type BatchListRow = {
  id: string;
  methodLabel: string;
  methodVersion: number;
  stepName: string;
  status: MockBatch["status"];
  statusLabel: string; // AC 8: "At step 2 of 5 — Digestion" / "Awaiting review" / …
  deadline: string | null; // AC 9: earliest job deadline among the samples
  sampleCount: number;
  qcPositions: number;
  maxPositions: number;
  compositionLatched: boolean;
  createdAt: string;
  createdBy: string;
};

/** One selectable item for a required equipment type (US-D3 AC 4). */
export type EquipmentOption = {
  equipmentId: string;
  assetId: string;
  name: string;
  state: "available" | "due-soon";
  warning: string | null; // due-soon items are selectable WITH a warning
};

export type StepRequiredType = {
  typeId: string;
  typeName: string;
  options: EquipmentOption[]; // Blocked items are never options…
  blocked: { assetId: string; name: string; reasons: string[] }[]; // …but stay visible with why
};

/** One entry of the Steps rail (AC 3). */
export type StepRailEntry = {
  index: number;
  id: string;
  name: string;
  state: "completed" | "current" | "pending";
  /** Latest completion record for this step (a redo supersedes on the rail;
   * every record stays in History). */
  lastCompletion: { by: string; at: string; equipment: string[] } | null;
  /** Populated for the CURRENT step only — what completing it requires. */
  requiredTypes: StepRequiredType[];
};

export type BatchDetail = {
  record: MockBatch;
  labName: string;
  methodLabel: string;
  stepName: string;
  maxPositions: number;
  positionsUsed: number;
  samples: {
    id: string;
    jobId: string;
    customer: string;
    typeName: string;
    description: string;
    acceptance: SampleAcceptance | null;
    requested: boolean;
  }[];
  qc: {
    materialId: string;
    code: string;
    name: string;
    typeLabel: string;
    lotNumber: string;
    expiryDate: string;
    quantity: number;
  }[];
  /** AC 10: composition is editable ONLY here — open, first step, never any
   * work. The moment the latch flips this is false forever. */
  compositionOpen: boolean;
  /** Samples the edit dialog may ADD (excludes current members). */
  addableSamples: EligibleSample[];
  qcOptions: MethodBatchOptions["qcOptions"];
  // --- US-D3 ---
  statusLabel: string; // AC 8, derived: "At step 2 of 5 — Digestion" / …
  deadline: string | null; // AC 9: earliest job deadline among the samples
  steps: StepRailEntry[]; // AC 3: the rail, derived from state + event log
  worksheets: Attachment[]; // AC 5 gate / US-D4 AC 9 versions (last = current)
  events: MockBatchEvent[]; // AC 2: History IS the event log (pure view)
  /** Per-sample progress for THIS batch's method (Samples tab, AC 2). */
  sampleProgress: Record<string, "received" | "in-batch" | "in-progress" | "completed">;
};

export type BatchActionResult =
  | { status: "success"; batchId?: string }
  | { status: "error"; message: string };

export interface BatchApi {
  /** Work screen: scoped to the active lab (null = org-wide support session). */
  listBatches(actor: BatchActor, activeLabId: string | null): Promise<BatchListRow[]>;
  getBatch(actor: BatchActor, batchId: string): Promise<BatchDetail | null>;
  /** Per-method creation options for the active lab (eligibility computed
   * server-side; the client only renders it — invariant 4). */
  creationOptions(actor: BatchActor, labId: string): Promise<MethodBatchOptions[]>;
  /** AC 1/2/3/5/6/7/8/9/12/13. Pins the method version, issues the immutable
   * number, generates the working copy, writes the audit trail. */
  createBatch(actor: BatchActor, input: CreateBatchInput): Promise<BatchActionResult>;
  /** AC 10: add/remove samples and QC while the one-way latch is open;
   * regenerates the working copy so it always matches the composition. */
  updateComposition(
    actor: BatchActor,
    batchId: string,
    input: BatchCompositionInput,
  ): Promise<BatchActionResult>;
  /** Working-copy bytes for download (null when only seed metadata exists). */
  workingCopyFile(
    actor: BatchActor,
    batchId: string,
  ): Promise<{ fileName: string; bytes: Uint8Array } | null>;

  // --- US-D3: the step engine. All transitions server-enforced (AC 10). ---

  /** AC 4/5: complete the CURRENT step. `expectedStepIndex` is the concurrency
   * token — a stale value fails safely with a refresh message (AC 10).
   * `equipment` = the specific item used per required type. Completing the
   * final step needs the worksheet attached and moves to Awaiting review. */
  completeStep(
    actor: BatchActor,
    batchId: string,
    expectedStepIndex: number,
    equipment: { typeId: string; equipmentId: string }[],
  ): Promise<BatchActionResult>;
  /** AC 6: Admin/Lab manager, mandatory reason; rework only — composition
   * stays latched forever. From Awaiting review any step may be targeted. */
  setBackStep(
    actor: BatchActor,
    batchId: string,
    toStepIndex: number,
    reason: string,
  ): Promise<BatchActionResult>;
  /** AC 7: void with reason at any point before completion; never deleted;
   * samples' per-method state returns to Received via the derived view. */
  voidBatch(actor: BatchActor, batchId: string, reason: string): Promise<BatchActionResult>;
  /** US-D4 AC 9 (thin slice consumed by AC 5's gate): upload the completed
   * worksheet — replacing appends a NEW version, never an overwrite. */
  uploadWorksheet(
    actor: BatchActor,
    batchId: string,
    file: { fileName: string; bytes: Uint8Array },
  ): Promise<BatchActionResult>;
}

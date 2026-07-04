import type { MockBatch, SampleAcceptance } from "@/lib/mock-db";
import type { OrgRole } from "@/lib/permissions";

// Batch-creation operations of US-D1. Mock behind an interface, real backend
// plugs in later. US-D3 (steps/void), US-D4 (data entry), US-D5 (import),
// US-D6 (review/completion) and US-D2 (work queue) extend this module.

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
  status: "open" | "completed" | "voided";
  sampleCount: number;
  qcPositions: number;
  maxPositions: number;
  compositionLatched: boolean;
  createdAt: string;
  createdBy: string;
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
}

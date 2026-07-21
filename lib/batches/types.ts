import type {
  Attachment,
  ImportColumnMapping,
  MockBatch,
  MockBatchEvent,
  MockImportConfig,
  MockMeasurementRecord,
  ResultValue,
  SampleAcceptance,
} from "@/lib/mock-db";
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
    /** True for an entry the batch already holds whose material is no longer
     * offered (expired/deactivated) — shown so it can be removed; the server
     * only allows keeping/reducing/removing it, never increasing. */
    heldOnly?: boolean;
  }[];
};

export type BatchListRow = {
  id: string;
  methodId: string; // US-D2 AC 4: method filter
  methodLabel: string;
  methodVersion: number;
  stepName: string;
  status: MockBatch["status"];
  statusLabel: string; // AC 8: "At step 2 of 5 — Digestion" / "Awaiting review" / …
  deadline: string | null; // AC 9: earliest job deadline among the samples
  overdue: boolean; // US-D2 AC 2: deadline passed & batch not finished — a flag, never a status
  assignee: string | null; // US-D2: email, or null = open pool
  assigneeName: string | null;
  /** LIVE check (pass-4 fix): false = the assignee can no longer act on this
   * batch (deactivated / moved lab / de-cleared) — badge, don't present as
   * covered. Always true when unassigned. */
  assigneeCanAct: boolean;
  canClaim: boolean; // US-D2 AC 6: unassigned + THIS actor may work on it
  mine: boolean; // assigned to the requesting actor
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
    /** Sample (or its whole job) voided AFTER entering the batch — the batch
     * views must show it, like the job page does. */
    voided: boolean;
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
  // --- US-D2 ---
  assignee: string | null;
  assigneeName: string | null;
  /** LIVE check (pass-4 fix) — see BatchListRow.assigneeCanAct. */
  assigneeCanAct: boolean;
  // --- US-D3 ---
  statusLabel: string; // AC 8, derived: "At step 2 of 5 — Digestion" / …
  deadline: string | null; // AC 9: earliest job deadline among the samples
  /** US-D2 AC 2 flag computed server-side with the ONE rule (pass-4 fix —
   * the detail header used to recompute a drifted variant locally). */
  overdue: boolean;
  steps: StepRailEntry[]; // AC 3: the rail, derived from state + event log
  worksheets: Attachment[]; // AC 5 gate / US-D4 AC 9 versions (last = current)
  events: MockBatchEvent[]; // AC 2: History IS the event log (pure view)
  /** Per-sample progress for THIS batch's method (Samples tab, AC 2). */
  sampleProgress: Record<string, "received" | "in-batch" | "in-progress" | "completed">;
};

// ---- US-D4: the results grid ------------------------------------------------

export type ResultTarget = { targetType: "sample" | "qc"; targetId: string };

/** Raw form input for one cell — parsed and validated SERVER-side (AC 5). */
export type ResultValueInput =
  | { kind: "numeric"; raw: string }
  | { kind: "censored"; qualifier: "<" | ">"; boundaryRaw: string }
  | { kind: "qualifier"; qualifierId: string }
  | { kind: "text"; text: string }
  | { kind: "no-result"; reason: string };

export type GridCell = {
  /** Newest record = the current value (pure view); null = empty cell. */
  current: MockMeasurementRecord | null;
  /** Full correction chain, newest first (AC 8) — length > 1 shows ⟳. */
  chain: MockMeasurementRecord[];
};

export type ResultsGrid = {
  entryOpen: boolean; // AC 1/10: open batches only; review closes the grid
  entryClosedReason: string | null;
  columns: { analyteId: string; name: string; unit: string | null; loq: string | null }[];
  rows: {
    targetType: "sample" | "qc";
    targetId: string;
    label: string; // sample ID, or "BLK ×2"
    sub: string; // customer/description, or material name + lot
    voided?: boolean; // sample/job voided after batching — flagged in grid & review
  }[];
  /** Keyed `${targetType}:${targetId}:${analyteId}`. */
  cells: Record<string, GridCell>;
  qualifiers: { id: string; name: string }[]; // active org list (AC 3)
  filled: number;
  total: number;
  worksheetCount: number; // versions attached (AC 9 banner)
};

/** One parsed cell of a bulk preview (paste AC 13 / worksheet AC 14). */
export type BulkPreviewCell = {
  target: ResultTarget;
  rowLabel: string;
  analyteId: string;
  raw: string;
  outcome:
    // `value` is the VALIDATED result the verdict stands for (pass-4 review
    // fix): the staged preview→confirm equality check must catch a same-
    // display kind flip (numeric "12" vs a qualifier named "12"), and the
    // confirm writes exactly this value, never a live re-derivation.
    | { kind: "accepted"; display: string; value: ResultValue }
    | { kind: "rejected"; message: string }
    | { kind: "occupied" }; // never silently superseded (decision 4 Jul 2026)
};

export type BulkEntry = { target: ResultTarget; analyteId: string; raw: string };

// ---- US-D5: instrument import -----------------------------------------------

export type ImportConfigInput = {
  name: string;
  labId: string;
  fileType: "csv" | "excel";
  /** Excel only: the declared sheet to read (triage decision 9). */
  sheetName: string;
  orientation: "wide" | "long";
  idColumn: string;
  columns: ImportColumnMapping[];
  analyteColumn: string;
  valueColumn: string;
  longUnits: { analyteName: string; unit: string | null }[];
  decimalSeparator: "comma" | "point";
  csvDelimiter: "comma" | "semicolon" | "tab";
};

export type ImportRowMatch =
  | { kind: "sample"; id: string }
  | { kind: "qc"; materialId: string; code: string }
  | { kind: "out-of-batch"; sampleId: string } // exists elsewhere — only skippable
  // Two batch QC entries share this code (legal via grandfathering): the row
  // must be explicitly mapped to the intended entry or skipped — auto-picking
  // one would be a silent wrong-target write (pass-4 review fix).
  | { kind: "ambiguous-qc"; code: string }
  | { kind: "unknown" }; // must be mapped or skipped with a reason (AC 4)

export type ImportCellVerdict =
  | { kind: "ok"; display: string }
  | { kind: "conflict"; display: string; existing: string } // default keep (AC 7)
  | { kind: "rejected"; message: string }; // per-cell — never blocks the rest (AC 5)

export type ImportPreviewRow = {
  rowNumber: number;
  idCell: string;
  match: ImportRowMatch;
  cells: { analyteName: string; raw: string; verdict: ImportCellVerdict }[];
};

export type ImportPreview = {
  token: string; // one-use staging token; confirm re-reads the SAME bytes
  configId: string;
  configName: string;
  fileName: string;
  rows: ImportPreviewRow[];
  notices: string[]; // ignored columns, QC row-count vs quantity, missing headers
  unitErrors: string[]; // AC 6 hard errors — the column's cells are rejected
  conflictCount: number;
  unresolvedCount: number; // unknown rows still needing map/skip (blocks confirm)
};

export type ImportResolution =
  | { rowNumber: number; action: "map"; target: ResultTarget }
  | { rowNumber: number; action: "skip"; reason: string };

// ---- US-D6: review & completion ----------------------------------------------

export type ReviewView = {
  batchStatus: MockBatch["status"];
  columns: ResultsGrid["columns"];
  rows: ResultsGrid["rows"];
  cells: ResultsGrid["cells"];
  qualifiers: ResultsGrid["qualifiers"]; // for the post-completion replace dialog
  /** AC 1: `${materialId}:${analyteId}` → the exact lot's expectation ("5.0
   * ± 0.3 mg/L") or the blank's reporting limit ("< LOQ 0.010") — context for
   * the HUMAN judgement; no automated verdict until epic E. */
  qcExpectations: Record<string, string>;
  /** Every (sample × analyte) AND (QC × analyte) cell that blocks completion
   * (triage decisions 5+6, 17 Jul 2026): "empty" = no result at all;
   * "rejected" = the current record is rejected without a superseding value
   * or no-result. Each closes via set-back re-measurement or an explicit
   * no-result + reason. */
  gaps: {
    targetType: "sample" | "qc";
    targetId: string;
    label: string;
    analyteId: string;
    analyteName: string;
    kind: "empty" | "rejected";
  }[];
  undecidedCount: number; // current records still pending a decision
  canReview: boolean;
  reviewBlockedReason: string | null; // role or AC 2 segregation
  completeBlockers: string[]; // human-readable gate failures (empty = may complete)
  amendmentFlagged: boolean; // derived: any record carries the §7.8.8 flag
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
   * worksheet — replacing appends a NEW version, never an overwrite. AC 14:
   * the Results sheet is read at upload; `autoRead` reports whether a pending
   * preview is available or the fallback notice (pass-3 review fix). */
  uploadWorksheet(
    actor: BatchActor,
    batchId: string,
    file: { fileName: string; bytes: Uint8Array },
  ): Promise<
    | { status: "success"; batchId?: string; autoRead?: { readable: boolean; message: string } }
    | { status: "error"; message: string }
  >;

  // --- US-D4: manual data entry (the first ADR-2 records) ---

  resultsGrid(actor: BatchActor, batchId: string): Promise<ResultsGrid | null>;
  /** AC 2/5/7/8: enter or correct one cell. A correction REQUIRES a reason
   * and appends a new record; the old one is never altered.
   * `expectedCurrentRecordId` anchors the write to the record the dialog
   * showed as current (null = an empty cell): a concurrent write refuses
   * instead of misattaching the correction reason (pass-3 review fix). */
  enterResult(
    actor: BatchActor,
    batchId: string,
    target: ResultTarget,
    analyteId: string,
    input: ResultValueInput,
    supersedeReason: string,
    expectedCurrentRecordId: string | null,
  ): Promise<BatchActionResult>;
  /** AC 13: parse a pasted block per-cell with AC 5 validation — a preview,
   * nothing is written. Occupied cells are flagged, never overwritten. The
   * preview is STAGED under a one-use token: confirm applies exactly it or
   * refuses (pass-3 review fix, mirroring the import contract). */
  previewBulk(actor: BatchActor, batchId: string, entries: BulkEntry[]): Promise<
    { status: "error"; message: string } | { status: "success"; token: string; cells: BulkPreviewCell[] }
  >;
  /** AC 13: write the accepted cells of the STAGED preview (re-validated
   * server-side; any divergence from what was previewed refuses). */
  confirmBulk(actor: BatchActor, batchId: string, token: string): Promise<BatchActionResult>;
  /** AC 14: read the latest worksheet's Results sheet into a pending preview
   * (falls back with a clear notice — a convenience, never a gate). Staged
   * under a one-use token like previewBulk (pass-3 review fix). */
  previewWorksheet(actor: BatchActor, batchId: string): Promise<
    | { status: "error"; message: string }
    | { status: "success"; token: string; worksheetVersion: number; cells: BulkPreviewCell[]; notices: string[] }
  >;
  /** AC 14: confirm the auto-read — the server RE-READS the worksheet itself
   * so origin "worksheet" can never be forged onto hand-typed values, and
   * refuses when the worksheet was replaced or the outcome set drifted since
   * the staged preview (pass-3 review fix). */
  confirmWorksheet(actor: BatchActor, batchId: string, token: string): Promise<BatchActionResult>;

  // --- US-D2: the coordination layer (open pool + optional assignment) ---

  /** AC 6: claim an UNASSIGNED batch you are allowed to work on. */
  claimBatch(actor: BatchActor, batchId: string): Promise<BatchActionResult>;
  /** AC 6: release YOUR OWN claim (managers use assignBatch to unassign). */
  releaseClaim(actor: BatchActor, batchId: string): Promise<BatchActionResult>;
  /** AC 8: Admin/Lab manager (re/un)assign; an assignee without the right to
   * work on the batch is blocked with a clear message. null = unassign. */
  assignBatch(
    actor: BatchActor,
    batchId: string,
    assigneeEmail: string | null,
  ): Promise<BatchActionResult>;

  // --- US-D5: instrument import (layer 1 of the two-layer model) ---

  /** AC 1: lab-level masterdata — everyone with lab access may read (the
   * import dialog needs the list); managing is Admin/Lab manager. */
  /** labId null = every lab the actor may view — the masterdata scoping
   * exemption (triage decision 11, 17 Jul 2026), like the QC/equipment lists;
   * a concrete labId scopes to that lab (the batch import dialog). */
  listImportConfigs(actor: BatchActor, labId: string | null): Promise<MockImportConfig[]>;
  /** Create (configId null) or edit. Deactivate-never-delete via setStatus. */
  saveImportConfig(
    actor: BatchActor,
    configId: string | null,
    input: ImportConfigInput,
  ): Promise<BatchActionResult>;
  setImportConfigStatus(
    actor: BatchActor,
    configId: string,
    status: "active" | "inactive",
    reason: string,
  ): Promise<BatchActionResult>;
  /** AC 3/4/5/6/7: parse file + configuration into the full preview — nothing
   * is written; the file is staged under a one-use token for confirm. */
  previewImport(
    actor: BatchActor,
    batchId: string,
    configId: string,
    file: { fileName: string; bytes: Uint8Array },
  ): Promise<{ status: "error"; message: string } | { status: "success"; preview: ImportPreview }>;
  /** AC 4/7/8/9/10: confirm — blocked while unresolved rows remain; stores
   * the file + mapping snapshot + row outcomes as ONE event BEFORE writing
   * records; conflicts default keep, opted-in replaces supersede with the
   * once-entered reason; records carry origin `import` + the event id. */
  confirmImport(
    actor: BatchActor,
    batchId: string,
    token: string,
    resolutions: ImportResolution[],
    replaceCells: { rowNumber: number; analyteName: string }[],
    replaceAll: boolean,
    supersedeReason: string,
  ): Promise<BatchActionResult>;

  // --- US-D6: review & completion (closes the core loop) ---

  reviewView(actor: BatchActor, batchId: string): Promise<ReviewView | null>;
  /** AC 3: decide one CURRENT result — rejected requires a reason; each
   * decision is its own attributed status transition + audit event. */
  setResultValidity(
    actor: BatchActor,
    batchId: string,
    recordId: string,
    validity: "valid" | "rejected",
    reason: string,
  ): Promise<BatchActionResult>;
  /** AC 3: review-by-exception — every pending result still receives its own
   * attributed status record and audit event. */
  validateAllUnflagged(actor: BatchActor, batchId: string): Promise<BatchActionResult>;
  /** AC 4: explicitly close a sample-cell gap as no-result + reason (the
   * other route is a set-back, which reopens entry). */
  closeGapNoResult(
    actor: BatchActor,
    batchId: string,
    target: ResultTarget,
    analyteId: string,
    reason: string,
  ): Promise<BatchActionResult>;
  /** AC 6: the completion record IS the approval act; final (AC 9). Blocked
   * while gaps or undecided results remain. */
  completeBatch(actor: BatchActor, batchId: string): Promise<BatchActionResult>;
  /** AC 8: post-completion replace — Admin/Lab manager, mandatory reason,
   * original retained, §7.8.8 "amendment check required" flag raised.
   * `expectedCurrentRecordId` anchors the replacement to the record the
   * dialog showed as current — overlapping replacements refuse instead of
   * silently chaining onto each other (pass-3 review fix). */
  replaceCompletedResult(
    actor: BatchActor,
    batchId: string,
    target: ResultTarget,
    analyteId: string,
    input: ResultValueInput,
    reason: string,
    expectedCurrentRecordId: string,
  ): Promise<BatchActionResult>;
}

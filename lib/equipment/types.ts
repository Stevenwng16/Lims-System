import type {
  CheckFrequency,
  MockCheckEntry,
  MockCheckType,
  MockEquipment,
  MockEquipmentType,
  QcTolerance,
} from "@/lib/mock-db";
import type { OrgRole } from "@/lib/permissions";

// Equipment operations of US-B3. Mock behind an interface, real backend plugs
// in later. The availability state is computed live on every read (AC 6) —
// no API here can set it directly, and none may ever be added (AC 7).

export type EquipmentActor = {
  email: string;
  role: OrgRole;
  labs: string[]; // lab NAMES the user is assigned to
  orgId: string;
  isSupport: boolean;
};

export type EquipmentInput = {
  name: string;
  assetId: string;
  typeId: string;
  labId: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  location: string;
  description: string;
};

export type CalibrationInput = {
  intervalMonths: number | null;
  lastDate: string | null; // "yyyy-mm-dd"
  dueDate: string | null; // manual override; null = derive from last + interval
};

export type CheckTypeInput = {
  name: string;
  frequency: CheckFrequency;
  criterion:
    | { kind: "numeric"; expectedValue: string; unit: string | null; tolerance: QcTolerance }
    | { kind: "manual"; description: string };
};

export type LogCheckInput = {
  checkTypeId: string;
  measuredValue: string; // "" = none; REQUIRED when the check type is numeric (AC 5)
  result: "pass" | "fail" | ""; // manual choice — ignored for numeric criteria
  notes: string;
};

// Computed, never stored (AC 6). `blockedReasons` non-empty ⇔ state "blocked".
export type Availability = {
  state: "available" | "due-soon" | "blocked";
  blockedReasons: string[];
  warnings: string[];
};

export type CalibrationState = "valid" | "due-soon" | "expired" | "none";
export type ChecksState = "ok" | "due-today" | "overdue" | "failed" | "none";

export type EquipmentListItem = {
  id: string;
  name: string;
  assetId: string;
  typeName: string;
  labName: string;
  calibration: { state: CalibrationState; dueDate: string | null };
  checks: { state: ChecksState; label: string };
  availability: Availability;
  status: "active" | "inactive";
};

export type CheckTypeView = MockCheckType & {
  lastEntry: MockCheckEntry | null;
  nextDue: string | null; // per-use / never-performed / retired → null
};

export type MethodLinkView = {
  methodId: string;
  stepId: string | null;
  methodName: string; // resolved against the CURRENT method version
  methodStatus: "active" | "inactive";
  stepName: string | null; // null for a method-level link or a stale step id
};

export type EquipmentDetail = {
  record: MockEquipment;
  typeName: string;
  typeStatus: "active" | "inactive";
  labName: string;
  availability: Availability;
  calibrationState: CalibrationState;
  checkTypes: CheckTypeView[];
  links: MethodLinkView[];
  warningDays: number; // the org's configured calibration warning window
};

export type EquipmentActionResult =
  | { status: "success"; equipmentId?: string }
  | { status: "error"; message: string };

export interface EquipmentApi {
  /** AC 1: admins see the whole organisation; everyone else their own lab(s). */
  listEquipment(actor: EquipmentActor): Promise<EquipmentListItem[]>;
  getEquipment(actor: EquipmentActor, equipmentId: string): Promise<EquipmentDetail | null>;
  /** AC 2/13: asset ID unique within the organisation — across active AND
   * inactive records (a physical asset's ID is never reissued). */
  createEquipment(actor: EquipmentActor, input: EquipmentInput): Promise<EquipmentActionResult>;
  updateEquipment(
    actor: EquipmentActor,
    equipmentId: string,
    input: EquipmentInput,
  ): Promise<EquipmentActionResult>;
  /** AC 3. Once a due date exists it can be renewed but never cleared —
   * removing the requirement would be a silent unblock (AC 7). */
  updateCalibration(
    actor: EquipmentActor,
    equipmentId: string,
    input: CalibrationInput,
  ): Promise<EquipmentActionResult>;
  /** Calibration certificate via the central attachment facility (ADR-3). */
  uploadCertificate(
    actor: EquipmentActor,
    equipmentId: string,
    file: { fileName: string; bytes: Uint8Array },
  ): Promise<EquipmentActionResult>;
  /** AC 4/13: a defined check has a frequency and an acceptance criterion. */
  addCheckType(
    actor: EquipmentActor,
    equipmentId: string,
    input: CheckTypeInput,
  ): Promise<EquipmentActionResult>;
  updateCheckType(
    actor: EquipmentActor,
    equipmentId: string,
    checkTypeId: string,
    input: CheckTypeInput,
  ): Promise<EquipmentActionResult>;
  /** Retire/reactivate a check type (reason required). Logged history stays. */
  setCheckTypeStatus(
    actor: EquipmentActor,
    equipmentId: string,
    checkTypeId: string,
    status: "active" | "inactive",
    reason: string,
  ): Promise<EquipmentActionResult>;
  /** AC 5: append-only; pass/fail COMPUTED server-side for numeric criteria.
   * Analysts may log checks for equipment in their lab(s). */
  logCheck(
    actor: EquipmentActor,
    equipmentId: string,
    input: LogCheckInput,
  ): Promise<EquipmentActionResult>;
  /** AC 10: replace the equipment↔method/step link set. */
  setMethodLinks(
    actor: EquipmentActor,
    equipmentId: string,
    links: { methodId: string; stepId: string | null }[],
  ): Promise<EquipmentActionResult>;
  /** AC 8: the one manual Blocked cause — set with a reason… */
  setOutOfService(
    actor: EquipmentActor,
    equipmentId: string,
    reason: string,
  ): Promise<EquipmentActionResult>;
  /** …and cleared only by an explicit return to service. Both are recorded. */
  returnToService(
    actor: EquipmentActor,
    equipmentId: string,
    note: string,
  ): Promise<EquipmentActionResult>;
  /** AC 11: deactivate, never delete. Reason required (invariant 2). */
  setStatus(
    actor: EquipmentActor,
    equipmentId: string,
    status: "active" | "inactive",
    reason: string,
  ): Promise<EquipmentActionResult>;

  /** AC 2: the configurable type list — Admins only. */
  listTypes(actor: EquipmentActor): Promise<MockEquipmentType[]>;
  createType(actor: EquipmentActor, name: string): Promise<EquipmentActionResult>;
  renameType(actor: EquipmentActor, typeId: string, name: string): Promise<EquipmentActionResult>;
  setTypeStatus(
    actor: EquipmentActor,
    typeId: string,
    status: "active" | "inactive",
    reason: string,
  ): Promise<EquipmentActionResult>;
}

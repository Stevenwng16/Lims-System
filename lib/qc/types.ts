import type { MockQcMaterial, QcExpectedValue, QcType } from "@/lib/mock-db";
import type { OrgRole } from "@/lib/permissions";

// QC-material operations of US-B2. Mock behind an interface, real backend
// plugs in later. Comparison logic (pass/fail) lives in epic E; adding QC to a
// batch in epic D — this module stores the materials and their expected values.

export type QcActor = {
  email: string;
  role: OrgRole;
  labs: string[]; // lab NAMES the user is assigned to
  orgId: string;
  isSupport: boolean;
};

export type QcMaterialInput = {
  name: string;
  code: string;
  type: QcType;
  labId: string;
  supplier: string;
  lotNumber: string;
  expiryDate: string;
  description: string;
  expectedValues: QcExpectedValue[];
};

export type QcListItem = {
  id: string;
  name: string;
  code: string;
  type: QcType;
  labName: string;
  lotNumber: string;
  analyteCount: number;
  expiryDate: string;
  expiry: "ok" | "soon" | "expired" | "none"; // AC 6 flagging
  status: "active" | "inactive";
  hasCertificate: boolean;
};

export type QcActionResult =
  | { status: "success"; materialId?: string }
  | { status: "error"; message: string };

export interface QcApi {
  /** AC 1: admins see the whole organisation; lab managers their own lab(s). */
  listMaterials(actor: QcActor): Promise<QcListItem[]>;
  getMaterial(actor: QcActor, materialId: string): Promise<MockQcMaterial | null>;
  /** AC 2/10 — also used for "new lot": a new lot is a NEW record (AC 7). */
  createMaterial(actor: QcActor, input: QcMaterialInput): Promise<QcActionResult>;
  /** targetStatus is the status the record will HAVE after the save, so the
   * code-uniqueness rule (active-only) is applied correctly (AC 2/7). */
  updateMaterial(
    actor: QcActor,
    materialId: string,
    input: QcMaterialInput,
    targetStatus: "active" | "inactive",
  ): Promise<QcActionResult>;
  /** Guard-only status validation, so a combined Save never half-commits. */
  checkStatusChange(
    actor: QcActor,
    materialId: string,
    status: "active" | "inactive",
    reason: string,
  ): Promise<QcActionResult>;
  /** AC 8: deactivate, never delete. Reason required on change (invariant 2). */
  setStatus(
    actor: QcActor,
    materialId: string,
    status: "active" | "inactive",
    reason: string,
  ): Promise<QcActionResult>;
  /** Certificate via the central attachment facility (ADR-3). */
  uploadCertificate(
    actor: QcActor,
    materialId: string,
    file: { fileName: string; bytes: Uint8Array },
  ): Promise<QcActionResult>;
}

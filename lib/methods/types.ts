import type { MethodAnalyte, MethodStep, MethodVersion, TemplateVersion } from "@/lib/mock-db";
import type { OrgRole } from "@/lib/permissions";

// Method-management operations of US-B1. Mock behind an interface, real
// backend plugs in later (same pattern as every lib module). The versioning
// rule (AC 9) and all validation (AC 11) must be re-enforced by the backend.

export type MethodListItem = {
  id: string;
  name: string;
  code: string;
  labId: string;
  labName: string;
  stepCount: number;
  analyteCount: number;
  accredited: boolean;
  status: "active" | "inactive";
  version: number;
  usedByBatches: boolean;
  hasTemplate: boolean;
};

export type MethodDetail = {
  id: string;
  status: "active" | "inactive";
  statusReason?: string;
  usedByBatches: boolean;
  current: MethodVersion;
  templates: TemplateVersion[];
  versionCount: number;
};

export type MethodInput = {
  name: string;
  code: string;
  labId: string;
  description: string;
  accredited: boolean;
  maxSamplesPerBatch: number;
  steps: Pick<MethodStep, "id" | "name">[]; // hooks (equipment, validation rules) preserved server-side
  analytes: MethodAnalyte[];
};

/** Acting user, resolved server-side. Viewing: all org roles; managing: admin + lab manager (own labs). */
export type MethodActor = {
  email: string;
  role: OrgRole;
  labs: string[]; // lab NAMES (mock convention, see lib/mock-db.ts users)
  orgId: string;
};

export type MethodActionResult =
  | { status: "success"; methodId?: string; newVersion?: number }
  | { status: "error"; message: string };

export interface MethodApi {
  /** AC 1: admins see the whole organisation; everyone else their own lab(s). */
  listMethods(actor: MethodActor): Promise<MethodListItem[]>;
  getMethod(actor: MethodActor, methodId: string): Promise<MethodDetail | null>;
  /** AC 2/11: create (always version 1). */
  createMethod(actor: MethodActor, input: MethodInput): Promise<MethodActionResult>;
  /** AC 9/11: edit in place while unused; creates a new version once used. */
  updateMethod(actor: MethodActor, methodId: string, input: MethodInput): Promise<MethodActionResult>;
  /** AC 10/12: deactivate/reactivate; clearances stay intact. A status
   * CHANGE requires a reason (invariant 2; decision 4 Jul 2026). */
  setMethodStatus(
    actor: MethodActor,
    methodId: string,
    status: "active" | "inactive",
    reason: string,
  ): Promise<MethodActionResult>;
  /**
   * AC 6: new template version with a real SHA-256; on a used method this also
   * creates a new method version pinning the new template version.
   */
  replaceTemplate(
    actor: MethodActor,
    methodId: string,
    file: { fileName: string; bytes: Uint8Array; hasResultsSheet: boolean },
  ): Promise<MethodActionResult>;
}

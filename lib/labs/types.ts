import type { MockLab } from "@/lib/mock-db";

// Lab management operations of US-A5. Same pattern as lib/auth and
// lib/platform: mock behind an interface, real backend plugs in later.

// userCount, methodCount and equipmentCount are all computed from the live
// store (users: US-A6, methods: US-B1, equipment: US-B3) — never stored.
export type LabSummary = MockLab & {
  userCount: number;
  methodCount: number;
  equipmentCount: number;
};

export type LabInput = {
  name: string;
  code: string;
  description: string;
};

export type LabActionResult = { status: "success" } | { status: "error"; message: string };

export interface LabApi {
  /** AC 1: list with linked-record counts. */
  listLabs(orgId: string): Promise<LabSummary[]>;
  /** AC 2: code unique within the organisation. `actorEmail` = the creating
   * user (resolved server-side): the FIRST lab of a setup-pending organisation
   * completes first-run setup and assigns its creator to the lab — the only
   * admin could never assign themself afterwards, since US-A6 AC 9 blocks
   * self-service on lab assignments (13 Jul 2026 decision). */
  createLab(orgId: string, input: LabInput, actorEmail: string): Promise<LabActionResult>;
  /** AC 3: editing never rewrites codes already embedded in issued IDs. */
  updateLab(orgId: string, labId: string, input: LabInput): Promise<LabActionResult>;
  /** Guard-only validation of a status change (no mutation) so a combined
   * Save can check it before committing field edits (audit finding 20). */
  checkLabStatusChange(
    orgId: string,
    labId: string,
    status: "active" | "inactive",
    reason: string,
  ): Promise<LabActionResult>;
  /** AC 4/5/7: deactivate (never delete), blocked on active work / last active
   * lab. A status CHANGE requires a reason (invariant 2; decision 4 Jul 2026). */
  setLabStatus(
    orgId: string,
    labId: string,
    status: "active" | "inactive",
    reason: string,
  ): Promise<LabActionResult>;
}

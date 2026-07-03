import type { MockLab } from "@/lib/mock-db";

// Lab management operations of US-A5. Same pattern as lib/auth and
// lib/platform: mock behind an interface, real backend plugs in later.

// userCount and methodCount are computed from the live store (users: US-A6,
// methods: US-B1); equipmentCount stays a seed placeholder until US-B3.
export type LabSummary = MockLab & { userCount: number; methodCount: number };

export type LabInput = {
  name: string;
  code: string;
  description: string;
};

export type LabActionResult = { status: "success" } | { status: "error"; message: string };

export interface LabApi {
  /** AC 1: list with linked-record counts. */
  listLabs(orgId: string): Promise<LabSummary[]>;
  /** AC 2: code unique within the organisation. */
  createLab(orgId: string, input: LabInput): Promise<LabActionResult>;
  /** AC 3: editing never rewrites codes already embedded in issued IDs. */
  updateLab(orgId: string, labId: string, input: LabInput): Promise<LabActionResult>;
  /** AC 4/5/7: deactivate (never delete), blocked on active work / last active
   * lab. A status CHANGE requires a reason (invariant 2; decision 4 Jul 2026). */
  setLabStatus(
    orgId: string,
    labId: string,
    status: "active" | "inactive",
    reason: string,
  ): Promise<LabActionResult>;
}

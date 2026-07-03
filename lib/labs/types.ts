import type { MockLab } from "@/lib/mock-db";

// Lab management operations of US-A5. Same pattern as lib/auth and
// lib/platform: mock behind an interface, real backend plugs in later.

export type LabSummary = MockLab & { userCount: number };

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
  /** AC 4/5/7: deactivate (never delete), blocked on active work / last active lab. */
  setLabStatus(orgId: string, labId: string, status: "active" | "inactive"): Promise<LabActionResult>;
}

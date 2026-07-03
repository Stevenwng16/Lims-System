import { mockDb, type MockLab } from "@/lib/mock-db";
import type { LabActionResult, LabApi, LabInput, LabSummary } from "./types";

function orgLabs(orgId: string): MockLab[] {
  return [...mockDb.labs.values()].filter((lab) => lab.orgId === orgId);
}

function userCount(lab: MockLab): number {
  // Mock: users reference labs by name until assignment becomes real (US-A6).
  return [...mockDb.users.values()].filter(
    (u) => u.orgId === lab.orgId && u.labs.includes(lab.name),
  ).length;
}

function validateInput(orgId: string, input: LabInput, excludeLabId?: string): string | null {
  if (!input.name.trim()) return "Lab name is required.";
  if (!input.code.trim()) return "A short code is required (it is used in IDs and labels).";
  const code = input.code.trim().toUpperCase();
  const clash = orgLabs(orgId).some(
    (lab) => lab.id !== excludeLabId && lab.code.toUpperCase() === code,
  );
  // Unique within the organisation only (AC 2) — other organisations may
  // freely use the same code.
  if (clash) return `The code "${code}" is already used by another lab in this organisation.`;
  return null;
}

export const mockLabApi: LabApi = {
  async listLabs(orgId): Promise<LabSummary[]> {
    return orgLabs(orgId).map((lab) => ({ ...lab, userCount: userCount(lab) }));
  },

  async createLab(orgId, input): Promise<LabActionResult> {
    const error = validateInput(orgId, input);
    if (error) return { status: "error", message: error };
    const code = input.code.trim().toUpperCase();
    const id = `lab-${orgId}-${code.toLowerCase()}-${mockDb.labs.size}`;
    mockDb.labs.set(id, {
      id,
      orgId,
      name: input.name.trim(),
      code,
      description: input.description.trim(),
      status: "active",
      methodCount: 0,
      equipmentCount: 0,
      hasActiveWork: false,
      analystsMayCreateBatches: false,
      reviewerMustDiffer: false,
    });
    return { status: "success" };
  },

  async updateLab(orgId, labId, input): Promise<LabActionResult> {
    const lab = mockDb.labs.get(labId);
    if (!lab || lab.orgId !== orgId) return { status: "error", message: "Unknown lab." };
    const error = validateInput(orgId, input, labId);
    if (error) return { status: "error", message: error };
    // AC 3: IDs already issued with the old code are never rewritten — the
    // code only affects future IDs/labels (nothing to do in the mock).
    lab.name = input.name.trim();
    lab.code = input.code.trim().toUpperCase();
    lab.description = input.description.trim();
    return { status: "success" };
  },

  async setLabStatus(orgId, labId, status): Promise<LabActionResult> {
    const lab = mockDb.labs.get(labId);
    if (!lab || lab.orgId !== orgId) return { status: "error", message: "Unknown lab." };

    if (status === "inactive") {
      if (lab.hasActiveWork) {
        // AC 5 — work must not be orphaned.
        return {
          status: "error",
          message:
            "This lab still has jobs or batches in progress. Finish or reassign that work before deactivating the lab.",
        };
      }
      const otherActive = orgLabs(orgId).some((l) => l.id !== labId && l.status === "active");
      if (!otherActive) {
        // AC 7 — every organisation keeps at least one active lab.
        return {
          status: "error",
          message: "This is the organisation's last active lab — it cannot be deactivated.",
        };
      }
    }

    lab.status = status;
    return { status: "success" };
  },
};

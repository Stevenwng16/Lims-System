import { currentMethodVersion, mockDb, type MockLab } from "@/lib/mock-db";
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

function methodCount(lab: MockLab): number {
  return [...mockDb.methods.values()].filter(
    (m) => m.orgId === lab.orgId && currentMethodVersion(m).labId === lab.id,
  ).length;
}

function equipmentCount(lab: MockLab): number {
  return [...mockDb.equipment.values()].filter(
    (e) => e.orgId === lab.orgId && e.labId === lab.id,
  ).length;
}

function validateInput(orgId: string, input: LabInput, excludeLabId?: string): string | null {
  if (!input.name.trim()) return "Lab name is required.";
  if (!input.code.trim()) return "A short code is required (it is used in IDs and labels).";
  const code = input.code.trim().toUpperCase();
  // The code becomes part of generated identifiers (AC 2), so constrain it
  // server-side, not just via the client maxLength (audit finding 21).
  if (code.length < 2 || code.length > 8) return "The code must be 2–8 characters.";
  if (!/^[A-Z0-9-]+$/.test(code)) {
    return "The code may contain only letters, digits and hyphens.";
  }
  const clash = orgLabs(orgId).some(
    (lab) => lab.id !== excludeLabId && lab.code.toUpperCase() === code,
  );
  // Unique within the organisation only (AC 2) — other organisations may
  // freely use the same code.
  if (clash) return `The code "${code}" is already used by another lab in this organisation.`;
  // Name uniqueness within the organisation: the mock joins users→labs by
  // name (see lib/mock-db.ts), so an ambiguous name would corrupt scoping.
  const name = input.name.trim().toLowerCase();
  const nameClash = orgLabs(orgId).some(
    (lab) => lab.id !== excludeLabId && lab.name.trim().toLowerCase() === name,
  );
  if (nameClash) return `A lab named "${input.name.trim()}" already exists in this organisation.`;
  return null;
}

export const mockLabApi: LabApi = {
  async listLabs(orgId): Promise<LabSummary[]> {
    return orgLabs(orgId).map((lab) => ({
      ...lab,
      userCount: userCount(lab),
      methodCount: methodCount(lab),
      equipmentCount: equipmentCount(lab),
    }));
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
    const oldName = lab.name;
    const newName = input.name.trim();
    if (oldName !== newName) {
      // The mock stores user lab-assignments by NAME — remap them so lab
      // managers/analysts keep their scope across a rename (found by audit;
      // the real backend joins by id and needs none of this).
      for (const user of mockDb.users.values()) {
        if (user.orgId === orgId) {
          user.labs = user.labs.map((n) => (n === oldName ? newName : n));
        }
      }
    }
    lab.name = newName;
    lab.code = input.code.trim().toUpperCase();
    lab.description = input.description.trim();
    return { status: "success" };
  },

  // Guard-only (no mutation) so a combined Save can validate the status change
  // BEFORE committing any field edits (audit finding 20).
  async checkLabStatusChange(orgId, labId, status, reason): Promise<LabActionResult> {
    const lab = mockDb.labs.get(labId);
    if (!lab || lab.orgId !== orgId) return { status: "error", message: "Unknown lab." };
    if (lab.status === status) return { status: "success" }; // no change, no reason needed

    // Invariant 2 (decision 4 Jul 2026): status changes carry a reason.
    if (!reason.trim()) {
      return { status: "error", message: "A reason is required to change the lab's status." };
    }
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
    return { status: "success" };
  },

  async setLabStatus(orgId, labId, status, reason): Promise<LabActionResult> {
    const guard = await this.checkLabStatusChange(orgId, labId, status, reason);
    if (guard.status === "error") return guard;
    const lab = mockDb.labs.get(labId)!;
    if (lab.status === status) return { status: "success" };
    lab.status = status;
    lab.statusReason = reason.trim();
    return { status: "success" };
  },
};

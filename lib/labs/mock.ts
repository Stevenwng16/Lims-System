import { currentMethodVersion, mockDb, type MockLab } from "@/lib/mock-db";
import type { LabActionResult, LabApi, LabInput, LabSummary } from "./types";

/** Append one audit event to the lab (invariants 1+6 — 17 Jul 2026 gap
 * closure: status and masterdata changes previously left no trace, actor and
 * timestamp were lost). Same append-only convention as jobs/users/equipment. */
function addLabEvent(lab: MockLab, actorEmail: string, summary: string): void {
  lab.events.push({
    id: `labev-${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    by: actorEmail,
    summary,
  });
}

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

  async createLab(orgId, input, actorEmail): Promise<LabActionResult> {
    const error = validateInput(orgId, input);
    if (error) return { status: "error", message: error };
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    const id = `lab-${orgId}-${code.toLowerCase()}-${mockDb.labs.size}`;
    mockDb.labs.set(id, {
      id,
      orgId,
      name,
      code,
      description: input.description.trim(),
      status: "active",
      hasActiveWork: false,
      analystsMayCreateBatches: false,
      reviewerMustDiffer: false,
      events: [],
    });
    addLabEvent(mockDb.labs.get(id)!, actorEmail, `Lab created (name "${name}", code ${code})`);
    // The first lab of a setup-pending organisation completes setup (US-A2
    // AC 4; 13 Jul 2026 decision replacing the seeded default lab). No
    // creator assignment happens here (supersedes the same-day auto-assign
    // decision): admins are ORG-WIDE — the shell offers them every active lab
    // without assignments, so lab creation needs no assignment side effect.
    // (Only admins can create labs, so the creator is always org-wide.)
    const org = mockDb.organisations.get(orgId);
    if (org) org.setupPending = false;
    return { status: "success" };
  },

  async updateLab(orgId, labId, input, actorEmail): Promise<LabActionResult> {
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
    // Before→after diff FIRST (invariant 1), then apply — same convention as
    // job edits; a no-op save appends nothing.
    const changes: string[] = [];
    const diff = (label: string, before: string, after: string) => {
      if (before !== after) changes.push(`${label}: "${before}" → "${after}"`);
    };
    diff("name", oldName, newName);
    diff("code", lab.code, input.code.trim().toUpperCase());
    diff("description", lab.description, input.description.trim());
    lab.name = newName;
    lab.code = input.code.trim().toUpperCase();
    lab.description = input.description.trim();
    if (changes.length > 0) addLabEvent(lab, actorEmail, `Lab edited: ${changes.join("; ")}`);
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
      // AC 5 — work must not be orphaned. Since US-D1/D3 batches are real:
      // any unfinished batch (open OR awaiting review) in the lab blocks
      // deactivation, alongside the seed flag (which still stands in for
      // not-yet-modelled active work).
      const hasOpenBatch = [...mockDb.batches.values()].some(
        (b) =>
          b.orgId === orgId &&
          b.labId === labId &&
          (b.status === "open" || b.status === "awaiting-review"),
      );
      if (lab.hasActiveWork || hasOpenBatch) {
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

  async setLabStatus(orgId, labId, status, reason, actorEmail): Promise<LabActionResult> {
    const guard = await this.checkLabStatusChange(orgId, labId, status, reason);
    if (guard.status === "error") return guard;
    const lab = mockDb.labs.get(labId)!;
    if (lab.status === status) return { status: "success" };
    lab.status = status;
    lab.statusReason = reason.trim();
    addLabEvent(
      lab,
      actorEmail,
      `Lab ${status === "inactive" ? "deactivated" : "reactivated"} — ${reason.trim()}`,
    );
    return { status: "success" };
  },
};

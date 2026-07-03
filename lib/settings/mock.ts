import { getOrgSettings, mockDb } from "@/lib/mock-db";
import { hasSeqToken } from "./format-id";
import type { ListEdit, SettingsActionResult, SettingsApi } from "./types";

function inRange(value: number, min: number, max: number, label: string): string | null {
  if (!Number.isFinite(value) || value < min || value > max) {
    return `${label} must be between ${min} and ${max}.`;
  }
  return null;
}

export const mockSettingsApi: SettingsApi = {
  async getSettings(orgId) {
    return getOrgSettings(orgId);
  },

  async updateSecurity(orgId, security): Promise<SettingsActionResult> {
    // AC 7: numeric fields enforce sensible min/max; invalid cannot be saved.
    const error =
      inRange(security.minPasswordLength, 8, 128, "Minimum password length") ??
      inRange(security.lockoutThreshold, 3, 10, "Lockout threshold") ??
      inRange(security.sessionTimeoutMinutes, 5, 480, "Session timeout");
    if (error) return { status: "error", message: error };
    getOrgSettings(orgId).security = security;
    return { status: "success" };
  },

  async updateIdentifiers(orgId, identifiers, jobLabel): Promise<SettingsActionResult> {
    // AC 7: a template without a {SEQ} token can never produce unique IDs.
    for (const [label, template] of [
      ["Job number format", identifiers.jobFormat],
      ["Sample number format", identifiers.sampleFormat],
      ["Batch number format", identifiers.batchFormat],
    ] as const) {
      if (!hasSeqToken(template)) {
        return {
          status: "error",
          message: `${label} must contain a {SEQ:000} token — without it IDs cannot be unique.`,
        };
      }
    }
    if (!jobLabel.trim()) return { status: "error", message: "The job label cannot be empty." };
    const settings = getOrgSettings(orgId);
    // AC 4: only future IDs are affected — nothing existing is ever rewritten.
    settings.identifiers = identifiers;
    settings.jobLabel = jobLabel.trim();
    return { status: "success" };
  },

  async updateList(orgId, list, edit: ListEdit): Promise<SettingsActionResult> {
    const settings = getOrgSettings(orgId);
    const current = settings[list];

    for (const item of edit.items) {
      if (!item.name.trim()) return { status: "error", message: "List entries cannot be empty." };
    }
    // Reconcile by id: rename/(de)activate only — deletion does not exist
    // (AC 9: historical records keep their value).
    for (const item of edit.items) {
      const existing = current.find((c) => c.id === item.id);
      if (existing) {
        existing.name = item.name.trim();
        existing.active = item.active;
      }
    }
    const newName = edit.newName?.trim();
    if (newName) {
      if (current.some((c) => c.name.toLowerCase() === newName.toLowerCase())) {
        return { status: "error", message: `"${newName}" is already in the list.` };
      }
      current.push({ id: `${list}-${Date.now()}`, name: newName, active: true });
    }
    return { status: "success" };
  },

  async updateBarcode(orgId, barcode): Promise<SettingsActionResult> {
    const error =
      inRange(barcode.widthMm, 20, 150, "Label width") ??
      inRange(barcode.heightMm, 10, 100, "Label height");
    if (error) return { status: "error", message: error };
    getOrgSettings(orgId).barcode = barcode;
    return { status: "success" };
  },

  async updateLabSettings(orgId, labId, settings): Promise<SettingsActionResult> {
    const lab = mockDb.labs.get(labId);
    if (!lab || lab.orgId !== orgId) return { status: "error", message: "Unknown lab." };
    // AC 6: takes effect immediately (enforced via US-A4/US-D6 checks).
    lab.analystsMayCreateBatches = settings.analystsMayCreateBatches;
    lab.reviewerMustDiffer = settings.reviewerMustDiffer;
    return { status: "success" };
  },
};

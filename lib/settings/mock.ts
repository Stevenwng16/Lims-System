import { getOrgSettings, mockDb } from "@/lib/mock-db";
import type { ListEdit, SettingsActionResult, SettingsApi } from "./types";

function inRange(value: number, min: number, max: number, label: string): string | null {
  // Whole numbers only (audit finding 24): a lockout threshold of 5.5 would
  // otherwise store and lock at 6.
  if (!Number.isInteger(value) || value < min || value > max) {
    return `${label} must be a whole number between ${min} and ${max}.`;
  }
  return null;
}

const SEQ_TOKEN_GLOBAL = /\{SEQ:0+\}/g;

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
    // AC 7: exactly one {SEQ} token per template (zero → not unique; more than
    // one → only the first renders, audit finding 25). {JOB} belongs to the
    // sample number only.
    const templates = [
      ["Job number format", identifiers.jobFormat, false],
      ["Sample number format", identifiers.sampleFormat, true],
      ["Batch number format", identifiers.batchFormat, false],
    ] as const;
    for (const [label, template, jobAllowed] of templates) {
      const seqCount = (template.match(SEQ_TOKEN_GLOBAL) ?? []).length;
      if (seqCount !== 1) {
        return {
          status: "error",
          message: `${label} must contain exactly one {SEQ:000} token.`,
        };
      }
      if (!jobAllowed && /\{JOB\}/.test(template)) {
        return {
          status: "error",
          message: `${label}: the {JOB} token is only available in the sample number format.`,
        };
      }
    }
    if (identifiers.sequenceReset !== "never" &&
        identifiers.sequenceReset !== "yearly" &&
        identifiers.sequenceReset !== "monthly") {
      return { status: "error", message: "Sequence reset must be never, yearly or monthly." };
    }
    // A period reset must be reflected by a period token in the format, or the
    // rendered number repeats every period and reissues IDs (audit finding 9).
    // {JOB} in the sample format carries the job's period, so it is exempt.
    if (identifiers.sequenceReset === "monthly") {
      for (const [label, template, isSample] of templates) {
        if (isSample && /\{JOB\}/.test(template)) continue;
        if (!/\{MM\}/.test(template)) {
          return {
            status: "error",
            message: `${label}: a monthly sequence reset needs a {MM} token, otherwise numbers repeat every month.`,
          };
        }
      }
    }
    if (identifiers.sequenceReset === "yearly") {
      for (const [label, template, isSample] of templates) {
        if (isSample && /\{JOB\}/.test(template)) continue;
        if (!/\{YY\}|\{YYYY\}/.test(template)) {
          return {
            status: "error",
            message: `${label}: a yearly sequence reset needs a {YY} or {YYYY} token, otherwise numbers repeat every year.`,
          };
        }
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

    // Validate the WHOLE edit before mutating anything (audit finding 23):
    // empties, and case-insensitive duplicates across renames + the new item.
    const finalNames: string[] = [];
    for (const item of current) {
      const edited = edit.items.find((e) => e.id === item.id);
      const name = (edited ? edited.name : item.name).trim();
      if (!name) return { status: "error", message: "List entries cannot be empty." };
      finalNames.push(name);
    }
    const newName = edit.newName?.trim();
    if (newName) finalNames.push(newName);
    const seen = new Set<string>();
    for (const name of finalNames) {
      const key = name.toLowerCase();
      if (seen.has(key)) {
        return { status: "error", message: `"${name}" appears more than once in the list.` };
      }
      seen.add(key);
    }

    // All checks passed — now apply (rename/(de)activate; never delete, AC 9).
    for (const item of edit.items) {
      const existing = current.find((c) => c.id === item.id);
      if (existing) {
        existing.name = item.name.trim();
        existing.active = item.active;
      }
    }
    if (newName) {
      // Stable-ish id without Date.now() collisions within one save.
      current.push({ id: `${list}-${current.length}-${newName.toLowerCase()}`, name: newName, active: true });
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

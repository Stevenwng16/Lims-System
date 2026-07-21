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

// US-A7 AC 8 (pass-3 review fix): every settings change lands in the
// append-only settingsEvents list with actor, timestamp and old → new values.
// Whether e.g. "reviewer must differ" was ON when a batch was reviewed must
// be provable afterwards — a bare boolean can't answer that.
function logSettingsEvent(orgId: string, actorEmail: string, summary: string): void {
  getOrgSettings(orgId).settingsEvents.push({
    id: `setev-${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    by: actorEmail,
    summary,
  });
}

/** "label: old → new" for each changed field — silent when unchanged. */
function diffFields(pairs: [label: string, before: unknown, after: unknown][]): string[] {
  const changes: string[] = [];
  for (const [label, before, after] of pairs) {
    if (before !== after) changes.push(`${label}: ${String(before)} → ${String(after)}`);
  }
  return changes;
}

export const mockSettingsApi: SettingsApi = {
  async getSettings(orgId) {
    return getOrgSettings(orgId);
  },

  async updateSecurity(orgId, security, actorEmail): Promise<SettingsActionResult> {
    // AC 7: numeric fields enforce sensible min/max; invalid cannot be saved.
    const error =
      inRange(security.minPasswordLength, 8, 128, "Minimum password length") ??
      inRange(security.lockoutThreshold, 3, 10, "Lockout threshold") ??
      inRange(security.sessionTimeoutMinutes, 5, 480, "Session timeout");
    if (error) return { status: "error", message: error };
    const settings = getOrgSettings(orgId);
    const changes = diffFields([
      ["minimum password length", settings.security.minPasswordLength, security.minPasswordLength],
      ["require complexity", settings.security.requireComplexity, security.requireComplexity],
      ["lockout threshold", settings.security.lockoutThreshold, security.lockoutThreshold],
      ["session timeout (min)", settings.security.sessionTimeoutMinutes, security.sessionTimeoutMinutes],
      ["require MFA", settings.security.requireMfa, security.requireMfa],
    ]);
    settings.security = security;
    if (changes.length > 0) logSettingsEvent(orgId, actorEmail, `Security settings: ${changes.join("; ")}`);
    return { status: "success" };
  },

  async updateIdentifiers(orgId, identifiers, jobLabel, actorEmail): Promise<SettingsActionResult> {
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
    // Sample sequences restart per job (US-C1 AC 4), so only the {JOB} token
    // keeps sample IDs unique across jobs — a sample format without it would
    // mint duplicate IDs org-wide (Fable re-review findings 6/21).
    if (!/\{JOB\}/.test(identifiers.sampleFormat)) {
      return {
        status: "error",
        message:
          "Sample number format must contain the {JOB} token — sample sequences restart per job, so the job number is what keeps sample IDs unique.",
      };
    }
    // Jobs are ORGANISATION-wide (13 Jul 2026): a job may span several labs,
    // so job numbers must not name one — and sample numbers follow the job.
    // {LAB} stays for batch numbers, where it is REQUIRED: batch sequences
    // run per lab, so without the lab code two labs' batches would render
    // identical numbers.
    if (/\{LAB\}/.test(identifiers.jobFormat)) {
      return {
        status: "error",
        message:
          "Job number format: the {LAB} token is not available — jobs are organisation-wide (one order may span several labs).",
      };
    }
    if (/\{LAB\}/.test(identifiers.sampleFormat)) {
      return {
        status: "error",
        message:
          "Sample number format: the {LAB} token is not available — samples follow the organisation-wide job number.",
      };
    }
    if (!/\{LAB\}/.test(identifiers.batchFormat)) {
      return {
        status: "error",
        message:
          "Batch number format must contain the {LAB} token — batch sequences run per lab, so the lab code is what keeps batch numbers unique.",
      };
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
    const changes = diffFields([
      ["job number format", settings.identifiers.jobFormat, identifiers.jobFormat],
      ["sample number format", settings.identifiers.sampleFormat, identifiers.sampleFormat],
      ["batch number format", settings.identifiers.batchFormat, identifiers.batchFormat],
      ["sequence reset", settings.identifiers.sequenceReset, identifiers.sequenceReset],
      ["job label", settings.jobLabel, jobLabel.trim()],
    ]);
    // AC 4: only future IDs are affected — nothing existing is ever rewritten.
    settings.identifiers = identifiers;
    settings.jobLabel = jobLabel.trim();
    if (changes.length > 0) logSettingsEvent(orgId, actorEmail, `Identifier settings: ${changes.join("; ")}`);
    return { status: "success" };
  },

  async updateList(orgId, list, edit: ListEdit, actorEmail): Promise<SettingsActionResult> {
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
    // Triage decision 8 (17 Jul 2026): a qualifier named like a number (or
    // starting with </>) would silently reinterpret pasted/imported numeric
    // instrument text as a qualifier record — refuse such names outright.
    // (Cells matching a grandfathered numeric-looking qualifier reject as
    // ambiguous at interpretation time.)
    if (list === "resultQualifiers") {
      for (const name of finalNames) {
        if (/^[<>]/.test(name) || /^-?[0-9.,]+$/.test(name)) {
          return {
            status: "error",
            message: `"${name}" reads as a number (or censored value) — a qualifier with this name would hijack numeric instrument text. Pick a non-numeric name.`,
          };
        }
      }
    }

    // All checks passed — now apply (rename/(de)activate; never delete, AC 9).
    // Each rename/(de)activation is recorded with old → new (AC 8, pass-3
    // review fix): a qualifier rename steers how pasted/auto-read instrument
    // text is interpreted from then on, so "who changed it, from what" must
    // be answerable.
    const listLabel = list === "resultQualifiers" ? "result qualifier" : "sample type";
    const changes: string[] = [];
    for (const item of edit.items) {
      const existing = current.find((c) => c.id === item.id);
      if (existing) {
        if (existing.name !== item.name.trim()) {
          changes.push(`${listLabel} "${existing.name}" renamed to "${item.name.trim()}"`);
        }
        if (existing.active !== item.active) {
          changes.push(`${listLabel} "${item.name.trim()}" ${item.active ? "activated" : "deactivated"}`);
        }
        existing.name = item.name.trim();
        existing.active = item.active;
      }
    }
    if (newName) {
      // Stable-ish id without Date.now() collisions within one save.
      current.push({ id: `${list}-${current.length}-${newName.toLowerCase()}`, name: newName, active: true });
      changes.push(`${listLabel} "${newName}" added`);
    }
    if (changes.length > 0) logSettingsEvent(orgId, actorEmail, changes.join("; "));
    return { status: "success" };
  },

  async updateBarcode(orgId, barcode, actorEmail): Promise<SettingsActionResult> {
    const error =
      inRange(barcode.widthMm, 20, 150, "Label width") ??
      inRange(barcode.heightMm, 10, 100, "Label height");
    if (error) return { status: "error", message: error };
    const settings = getOrgSettings(orgId);
    const changes = diffFields([
      ["width (mm)", settings.barcode.widthMm, barcode.widthMm],
      ["height (mm)", settings.barcode.heightMm, barcode.heightMm],
      ["show customer", settings.barcode.showCustomer, barcode.showCustomer],
      ["show sample type", settings.barcode.showSampleType, barcode.showSampleType],
      ["show job number", settings.barcode.showJobNumber, barcode.showJobNumber],
      ["show date", settings.barcode.showDate, barcode.showDate],
    ]);
    settings.barcode = barcode;
    if (changes.length > 0) logSettingsEvent(orgId, actorEmail, `Barcode label settings: ${changes.join("; ")}`);
    return { status: "success" };
  },

  async updateEquipmentSettings(orgId, equipment, actorEmail): Promise<SettingsActionResult> {
    // US-B3 AC 6: the "due soon" window is a warning horizon, not a block —
    // but it must stay a sane whole number of days.
    const error = inRange(equipment.calibrationWarningDays, 1, 365, "Calibration warning window");
    if (error) return { status: "error", message: error };
    const settings = getOrgSettings(orgId);
    const changes = diffFields([
      ["calibration warning window (days)", settings.equipment.calibrationWarningDays, equipment.calibrationWarningDays],
    ]);
    settings.equipment = equipment;
    if (changes.length > 0) logSettingsEvent(orgId, actorEmail, `Equipment settings: ${changes.join("; ")}`);
    return { status: "success" };
  },

  async updateLabSettings(orgId, labId, settings, actorEmail): Promise<SettingsActionResult> {
    const lab = mockDb.labs.get(labId);
    if (!lab || lab.orgId !== orgId) return { status: "error", message: "Unknown lab." };
    // AC 6: takes effect immediately (enforced via US-A4/US-D6 checks).
    // Old → new recorded per toggle (AC 8, pass-3 review fix): whether e.g.
    // "reviewer must differ" was ON when a given batch was reviewed — and who
    // flipped it — must be provable afterwards.
    const changes = diffFields([
      ["analysts may create batches", lab.analystsMayCreateBatches, settings.analystsMayCreateBatches],
      ["reviewer must differ from performer", lab.reviewerMustDiffer, settings.reviewerMustDiffer],
    ]);
    lab.analystsMayCreateBatches = settings.analystsMayCreateBatches;
    lab.reviewerMustDiffer = settings.reviewerMustDiffer;
    if (changes.length > 0) {
      logSettingsEvent(orgId, actorEmail, `Lab "${lab.name}" settings: ${changes.join("; ")}`);
    }
    return { status: "success" };
  },
};

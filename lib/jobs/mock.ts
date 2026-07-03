import { createHash } from "node:crypto";
import {
  currentMethodVersion,
  getOrgSettings,
  mockDb,
  type MockJob,
  type MockSample,
  type SampleAcceptance,
} from "@/lib/mock-db";
import { generateJobNumber, generateSampleId } from "./ids";
import type {
  JobActionResult,
  JobActor,
  JobApi,
  JobInput,
  JobListItem,
  JobOverviewRow,
  JobStatus,
  SampleInput,
} from "./types";

// Jobs are stored under an org-composite key so a job number that is only
// unique WITHIN an org (AC 2) can never overwrite another tenant's job
// (audit findings 1/8/12 — invariant 5). The visible id stays the bare number.
function jobKey(orgId: string, jobNumber: string): string {
  return `${orgId}:${jobNumber}`;
}

function canManage(actor: JobActor): boolean {
  // US-C1 authorization: only Admin / Lab manager create & manage jobs.
  return actor.role === "admin" || actor.role === "lab-manager";
}

function labNameById(labId: string): string {
  return mockDb.labs.get(labId)?.name ?? labId;
}

function canSeeLab(actor: JobActor, labId: string): boolean {
  // Admins and support sessions see the whole org; others their own lab(s).
  if (actor.role === "admin" || actor.isSupport) return true;
  return actor.labs.includes(labNameById(labId));
}

function canManageLab(actor: JobActor, labId: string): string | null {
  if (!canManage(actor)) return "Only Admins and Lab managers can manage jobs.";
  if (actor.role === "admin" || actor.isSupport) return null;
  return actor.labs.includes(labNameById(labId))
    ? null
    : "You can only manage jobs in your own lab(s).";
}

// AC 14: requested methods must be ACTIVE methods of the job's lab.
function activeMethodIdsForLab(orgId: string, labId: string): Set<string> {
  const ids = new Set<string>();
  for (const method of mockDb.methods.values()) {
    if (method.orgId !== orgId || method.status !== "active") continue;
    if (currentMethodVersion(method).labId === labId) ids.add(method.id);
  }
  return ids;
}

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const SAMPLE_TYPE_IDS = (orgId: string) =>
  new Set(getOrgSettings(orgId).sampleTypes.filter((t) => t.active).map((t) => t.id));

function validate(actor: JobActor, input: JobInput, existing?: MockJob): string | null {
  const lab = mockDb.labs.get(input.labId);
  if (!lab || lab.orgId !== actor.orgId) return "Choose the lab this job belongs to.";
  // A new job cannot start in an inactive lab; an existing job stays put.
  if (lab.status !== "active" && input.labId !== existing?.labId) {
    return "Jobs cannot be registered in an inactive lab.";
  }
  if (!input.customer.trim()) return "The customer name is required.";
  if (!input.receivedAt.trim()) return "The date and time of receipt are required.";
  if (input.samples.length < 1) return "A job needs at least one sample.";

  const activeMethods = activeMethodIdsForLab(actor.orgId, input.labId);
  for (const id of input.requestedMethodIds) {
    if (!activeMethods.has(id)) return "Requested methods must be active methods of the job's lab.";
  }

  const validTypes = SAMPLE_TYPE_IDS(actor.orgId);
  for (const s of input.samples) {
    if (!validTypes.has(s.typeId)) return "Each sample needs a valid sample type.";
    if (!s.description.trim()) return "Each sample needs a description.";
    if (s.quantity && !DECIMAL_PATTERN.test(s.quantity)) {
      return "Sample quantity must be a plain decimal number with a point (e.g. 1.5).";
    }
    for (const id of s.requestedMethodIds) {
      if (!activeMethods.has(id)) {
        return "Each sample's requested methods must be active methods of the job's lab.";
      }
    }
    if (s.condition === "deviation" && s.deviationType === "none") {
      return "A deviation must have a type (cosmetic, or does-not-match-description).";
    }
  }
  return null;
}

function buildSample(orgId: string, labId: string, jobNumber: string, receivedAt: string, s: SampleInput): MockSample {
  return {
    id: generateSampleId(orgId, jobNumber, labId, receivedAt),
    jobId: jobNumber,
    typeId: s.typeId,
    description: s.description.trim(),
    customerSampleRef: s.customerSampleRef.trim(),
    quantity: s.quantity.trim(),
    quantityUnit: s.quantityUnit.trim(),
    requestedMethodIds: s.requestedMethodIds,
    condition: s.condition,
    deviationType: s.condition === "deviation" ? s.deviationType : "none",
    deviationNote: s.condition === "deviation" ? s.deviationNote.trim() : "",
    attachments: [],
    acceptance: null, // decision recorded per sample afterwards (§7.4.3)
    reservationReason: "",
    consultation: null,
    status: null, // AC 9 — set to "received" on acceptance
    storageLocation: s.storageLocation.trim(),
    voided: false,
    createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
  };
}

function toListItem(job: MockJob): JobListItem {
  const live = job.samples.filter((s) => !s.voided);
  return {
    id: job.id,
    customer: job.customer,
    labName: labNameById(job.labId),
    receivedAt: job.receivedAt,
    sampleCount: live.length,
    awaitingDecision: live.filter((s) => s.acceptance === null).length,
    voided: job.voided,
  };
}

// US-C2 AC 7: status from active (accepted, non-voided) samples.
function deriveStatus(job: MockJob): JobStatus {
  if (job.voided) return "closed";
  const live = job.samples.filter((s) => !s.voided);
  const active = live.filter(
    (s) => s.acceptance === "accepted" || s.acceptance === "accepted-with-reservation",
  );
  // No testable samples: all live samples rejected (or none live).
  if (active.length === 0 && live.every((s) => s.acceptance === "rejected")) return "closed";
  if (active.length > 0 && active.every((s) => s.status === "completed")) return "completed";
  // Any active sample that has entered/passed a batch means the job has started
  // (a "completed" sample here implies partial progress — the all-completed
  // branch above already returned; audit findings 1/4/9).
  if (active.some((s) => s.status !== "received" && s.status !== null)) return "in-progress";
  return "not-started";
}

function overviewRow(job: MockJob, now: number): JobOverviewRow {
  const live = job.samples.filter((s) => !s.voided);
  const typeIds = [...new Set(live.map((s) => s.typeId))];
  const status = deriveStatus(job);
  const dueTime = job.dueDate ? new Date(job.dueDate).getTime() : NaN;
  // AC 8: decoupled from status — flagged if past or within 24h and not done.
  const overdue =
    status !== "completed" && !job.voided && !Number.isNaN(dueTime) && dueTime <= now + 24 * 3600_000;
  const methodIds = [
    ...new Set([...job.requestedMethodIds, ...live.flatMap((s) => s.requestedMethodIds)]),
  ];
  return {
    id: job.id,
    customer: job.customer,
    receivedAt: job.receivedAt,
    dueDate: job.dueDate,
    sampleTypeLabel: "", // resolved to a name in the page (needs org settings)
    sampleTypeIds: typeIds,
    methodIds,
    status,
    overdue,
    voided: job.voided,
  };
}

function applySampleEdits(sample: MockSample, s: SampleInput) {
  // AC 12: edit sample details in place — id / jobId / acceptance / consultation
  // / status / attachments are never touched here.
  sample.typeId = s.typeId;
  sample.description = s.description.trim();
  sample.customerSampleRef = s.customerSampleRef.trim();
  sample.quantity = s.quantity.trim();
  sample.quantityUnit = s.quantityUnit.trim();
  sample.requestedMethodIds = s.requestedMethodIds;
  sample.condition = s.condition;
  sample.deviationType = s.condition === "deviation" ? s.deviationType : "none";
  sample.deviationNote = s.condition === "deviation" ? s.deviationNote.trim() : "";
  sample.storageLocation = s.storageLocation.trim();
}

// Loads a job for a mutating action: tenant-scoped key, org check, and — for
// everything except voiding the job itself — freezes a voided job (audit
// findings 11/13; invariant 4).
function loadJobForWrite(
  actor: JobActor,
  jobId: string,
  opts: { allowVoided?: boolean } = {},
): { job: import("@/lib/mock-db").MockJob } | { error: string } {
  const job = mockDb.jobs.get(jobKey(actor.orgId, jobId));
  if (!job || job.orgId !== actor.orgId) return { error: "Unknown job." };
  const denied = canManageLab(actor, job.labId);
  if (denied) return { error: denied };
  if (job.voided && !opts.allowVoided) {
    return { error: "This job is voided (a closed record) and cannot be changed." };
  }
  return { job };
}

export const mockJobApi: JobApi = {
  async listJobs(actor): Promise<JobListItem[]> {
    return [...mockDb.jobs.values()]
      .filter((j) => j.orgId === actor.orgId && canSeeLab(actor, j.labId))
      .map(toListItem);
  },

  async jobOverview(actor, activeLabId): Promise<JobOverviewRow[]> {
    const now = new Date().getTime();
    const typeNames = new Map(
      getOrgSettings(actor.orgId).sampleTypes.map((t) => [t.id, t.name] as const),
    );
    return [...mockDb.jobs.values()]
      .filter((j) => j.orgId === actor.orgId && canSeeLab(actor, j.labId))
      // Scoped to the active lab (US-C2 AC 1). Org-wide (null) is ONLY for a
      // support session — a scoped user with no active lab gets an empty list,
      // never every lab's jobs (audit finding 5).
      .filter((j) => (actor.isSupport && activeLabId === null) || j.labId === activeLabId)
      .map((j) => {
        const row = overviewRow(j, now);
        const ids = row.sampleTypeIds;
        row.sampleTypeLabel =
          ids.length === 0 ? "—" : ids.length === 1 ? (typeNames.get(ids[0]) ?? ids[0]) : "Mixed";
        return row;
      });
  },

  async getJob(actor, jobId) {
    const job = mockDb.jobs.get(jobKey(actor.orgId, jobId));
    if (!job || job.orgId !== actor.orgId || !canSeeLab(actor, job.labId)) return null;
    return job;
  },

  async createJob(actor, input): Promise<JobActionResult> {
    const denied = canManageLab(actor, input.labId);
    if (denied) return { status: "error", message: denied };
    const error = validate(actor, input);
    if (error) return { status: "error", message: error };

    // Consume the immutable job number, then the per-job sample IDs.
    const jobNumber = generateJobNumber(actor.orgId, input.labId, input.receivedAt);
    // Never overwrite an already-issued number (defends against a misconfigured
    // reset period reissuing IDs — audit finding 9; hard-never "reissue an ID").
    if (mockDb.jobs.has(jobKey(actor.orgId, jobNumber))) {
      return {
        status: "error",
        message:
          "The generated job number is already in use — check the identifier format and sequence-reset settings.",
      };
    }
    const now = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    mockDb.jobs.set(jobKey(actor.orgId, jobNumber), {
      id: jobNumber,
      orgId: actor.orgId,
      labId: input.labId,
      customer: input.customer.trim(),
      customerRef: input.customerRef.trim(),
      receivedAt: input.receivedAt,
      receivedBy: actor.email, // auto-filled (AC 1)
      requestedMethodIds: input.requestedMethodIds,
      priority: input.priority.trim(),
      dueDate: input.dueDate.trim(),
      notes: input.notes.trim(),
      storageLocation: input.storageLocation.trim(),
      voided: false,
      createdAt: now,
      createdBy: actor.email,
      samples: input.samples.map((s) => buildSample(actor.orgId, input.labId, jobNumber, input.receivedAt, s)),
    });
    return { status: "success", jobId: jobNumber };
  },

  async updateJob(actor, jobId, input): Promise<JobActionResult> {
    const loaded = loadJobForWrite(actor, jobId);
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const { job } = loaded;
    // The lab is fixed after registration (the ID already embeds its code).
    const error = validate(actor, { ...input, labId: job.labId }, job);
    if (error) return { status: "error", message: error };

    // AC 12: the job number and existing sample IDs never change. Header fields
    // and existing sample details are edited in place; only genuinely new rows
    // (no matching id) mint a new sample ID. Voided samples are retained.
    job.customer = input.customer.trim();
    job.customerRef = input.customerRef.trim();
    job.receivedAt = input.receivedAt;
    job.requestedMethodIds = input.requestedMethodIds;
    job.priority = input.priority.trim();
    job.dueDate = input.dueDate.trim();
    job.notes = input.notes.trim();
    job.storageLocation = input.storageLocation.trim();

    const existingById = new Map(job.samples.map((s) => [s.id, s]));
    const reconciled: MockSample[] = [];
    for (const s of input.samples) {
      const existing = s.id ? existingById.get(s.id) : undefined;
      if (existing) {
        if (!existing.voided) applySampleEdits(existing, s);
        reconciled.push(existing);
      } else {
        reconciled.push(buildSample(actor.orgId, job.labId, job.id, job.receivedAt, s));
      }
    }
    // Keep any voided samples not present in the submission (retained record).
    for (const s of job.samples) if (s.voided && !reconciled.includes(s)) reconciled.push(s);
    job.samples = reconciled;
    return { status: "success", jobId };
  },

  async setSampleAcceptance(actor, jobId, sampleId, acceptance, reason): Promise<JobActionResult> {
    const loaded = loadJobForWrite(actor, jobId);
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const sample = loaded.job.samples.find((s) => s.id === sampleId);
    if (!sample || sample.voided) return { status: "error", message: "Unknown sample." };

    if (acceptance === "accepted-with-reservation" && !reason.trim()) {
      return { status: "error", message: "A reservation requires a reason (carried to the report)." };
    }
    // §7.4.3: a mismatch sample cannot be accepted until a consultation is
    // recorded (AC 8). Rejection needs no consultation.
    const accepting = acceptance === "accepted" || acceptance === "accepted-with-reservation";
    if (accepting && sample.deviationType === "mismatch" && !sample.consultation) {
      return {
        status: "error",
        message:
          "This sample does not match its description — record a customer consultation before accepting it.",
      };
    }

    sample.acceptance = acceptance;
    sample.reservationReason = acceptance === "accepted-with-reservation" ? reason.trim() : "";
    // AC 9: status starts at "received" on acceptance; a rejected sample never
    // enters the lifecycle (its decision is the end state).
    sample.status = accepting ? (sample.status ?? "received") : null;
    return { status: "success", jobId };
  },

  async recordConsultation(actor, jobId, sampleId, consultation): Promise<JobActionResult> {
    const loaded = loadJobForWrite(actor, jobId);
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const sample = loaded.job.samples.find((s) => s.id === sampleId);
    if (!sample || sample.voided) return { status: "error", message: "Unknown sample." };
    if (!consultation.who.trim() || !consultation.outcome.trim()) {
      return { status: "error", message: "Record who was consulted and the outcome." };
    }
    sample.consultation = {
      who: consultation.who.trim(),
      when: consultation.when.trim(),
      outcome: consultation.outcome.trim(),
      recordedBy: actor.email,
      recordedAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    };
    return { status: "success", jobId };
  },

  async addSampleAttachment(actor, jobId, sampleId, file): Promise<JobActionResult> {
    const loaded = loadJobForWrite(actor, jobId);
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const sample = loaded.job.samples.find((s) => s.id === sampleId);
    if (!sample || sample.voided) return { status: "error", message: "Unknown sample." };
    if (file.bytes.length === 0) return { status: "error", message: "The uploaded file is empty." };
    if (file.bytes.length > 5 * 1024 * 1024) {
      return { status: "error", message: "Attachments are limited to 5 MB in the mock." };
    }
    // ADR-3: immutable file + SHA-256 checksum over the actual bytes.
    sample.attachments.push({
      id: `att-${sample.attachments.length + 1}-${sample.id}`,
      fileName: file.fileName,
      sizeBytes: file.bytes.length,
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
      uploadedAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      uploadedBy: actor.email,
    });
    return { status: "success", jobId };
  },

  async voidJob(actor, jobId, reason): Promise<JobActionResult> {
    // allowVoided so we can detect (and reject) a re-void without the generic
    // frozen message.
    const loaded = loadJobForWrite(actor, jobId, { allowVoided: true });
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const { job } = loaded;
    if (job.voided) return { status: "error", message: "This job is already voided." };
    if (!reason.trim()) return { status: "error", message: "A reason is required to void a job." };
    // Void, never delete (AC 13) — the record and its IDs are retained.
    job.voided = true;
    job.voidReason = reason.trim();
    return { status: "success", jobId };
  },

  async voidSample(actor, jobId, sampleId, reason): Promise<JobActionResult> {
    const loaded = loadJobForWrite(actor, jobId);
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const { job } = loaded;
    const sample = job.samples.find((s) => s.id === sampleId);
    // Reject an already-voided sample so its original reason is never overwritten
    // (audit finding 15).
    if (!sample || sample.voided) return { status: "error", message: "Unknown sample." };
    if (!reason.trim()) return { status: "error", message: "A reason is required to void a sample." };
    if (job.samples.filter((s) => !s.voided).length <= 1) {
      // A job keeps at least one live sample (AC 14: a job has at least one).
      return { status: "error", message: "A job must keep at least one sample — void the whole job instead." };
    }
    sample.voided = true;
    sample.voidReason = reason.trim();
    return { status: "success", jobId };
  },
};

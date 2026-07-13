import { createHash } from "node:crypto";
import {
  currentMethodVersion,
  getOrgSettings,
  mockDb,
  type MockJob,
  type MockSample,
  type SampleAcceptance,
} from "@/lib/mock-db";
import { openBatchOfMethodContaining, sampleStatus } from "@/lib/batches/progress";
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

function canManage(actor: JobActor): string | null {
  // US-C1 authorization (13 Jul 2026 amendment: jobs are ORG-wide): Admins and
  // Lab managers create & manage jobs across the organisation — registration
  // is a reception function; the lab boundary governs EXECUTION (batches),
  // which stays strictly lab-scoped.
  return actor.role === "admin" || actor.role === "lab-manager"
    ? null
    : "Only Admins and Lab managers can manage jobs.";
}

/** The labs a job involves = the labs of its requested methods (job-level and
 * per sample). Jobs carry no lab of their own (13 Jul 2026 decision) — the
 * method, being lab-scoped masterdata, routes the work. */
export function involvedLabIds(job: MockJob): Set<string> {
  const ids = new Set<string>();
  const methodIds = [
    ...job.requestedMethodIds,
    ...job.samples.flatMap((s) => s.requestedMethodIds),
  ];
  for (const id of methodIds) {
    const method = mockDb.methods.get(id);
    if (method && method.orgId === job.orgId) ids.add(currentMethodVersion(method).labId);
  }
  return ids;
}

function canSee(actor: JobActor, job: MockJob): boolean {
  // Admins and support sessions see the whole org; lab-scoped roles see jobs
  // with work (requested methods) in their lab(s). A job with no methods yet
  // stays visible org-wide so it can never vanish for everyone.
  if (actor.role === "admin" || actor.isSupport) return true;
  const involved = involvedLabIds(job);
  if (involved.size === 0) return true;
  for (const labId of involved) {
    const name = mockDb.labs.get(labId)?.name;
    if (name && actor.labs.includes(name)) return true;
  }
  return false;
}

// AC 14 (amended 13 Jul 2026): requested methods must be ACTIVE methods of the
// organisation — any lab's; the method's lab routes the work.
function activeMethodIds(orgId: string): Set<string> {
  const ids = new Set<string>();
  for (const method of mockDb.methods.values()) {
    if (method.orgId === orgId && method.status === "active") ids.add(method.id);
  }
  return ids;
}

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const SAMPLE_TYPE_IDS = (orgId: string) =>
  new Set(getOrgSettings(orgId).sampleTypes.filter((t) => t.active).map((t) => t.id));

/** The deadline must be empty or a real yyyy-mm-dd date, enforced SERVER-side
 * (pass-4 review fix): only the client date control guaranteed the format, and
 * the D2 batch queue compares this string lexicographically for its sort and
 * ⚠ overdue flag — a non-ISO value mis-sorted and mis-flagged there while the
 * job overview (which parses via Date) disagreed about the same deadline. */
function dueDateError(raw: string): string | null {
  const due = raw.trim();
  if (!due) return null; // no deadline is allowed
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return "The deadline must be a calendar date in yyyy-mm-dd form.";
  }
  // Round-trip through Date: JS silently rolls an impossible day over into
  // the next month ("2026-02-31" → 3 Mar), so parse success alone proves
  // nothing — the components must survive unchanged.
  const [y, m, d] = due.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return "The deadline must be a real calendar date (yyyy-mm-dd).";
  }
  return null;
}

/** Append one audit event to the job (US-C3 AC 5 / invariant 1 — pass-4
 * review fix: job edits previously left NO trace anywhere; the History tab
 * reconstructed "illustrative" lines from current state, so before-values
 * were unrecoverable and a stale save could silently revert a colleague's
 * changes). Same append-only convention as batches/equipment/configs. */
function addJobEvent(job: MockJob, actorEmail: string, summary: string): void {
  job.events.push({
    id: `jev-${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    by: actorEmail,
    summary,
  });
}

/** Method ids rendered as their codes where resolvable — diff summaries stay
 * readable without hauling version labels around. */
function methodCodes(orgId: string, ids: string[]): string {
  return (
    ids
      .map((id) => {
        const method = mockDb.methods.get(id);
        return method && method.orgId === orgId ? currentMethodVersion(method).code : id;
      })
      .join(", ") || "none"
  );
}

// Per-sample rules (AC 14) against the job's lab — shared by create, update
// and add (US-C3 AC 7), so a single new sample is never gated on stale
// whole-job header state (audit findings 2/4). `grandfather` carries an
// EXISTING sample's current type/methods: references a sample already holds
// stay valid even after the type/method was deactivated, so editing an old
// record never dead-ends (Fable re-review findings 8/12/20). New references
// to inactive options remain rejected.
function validateSample(
  orgId: string,
  s: SampleInput,
  grandfather?: { typeId: string; methodIds: string[] },
): string | null {
  const activeMethods = activeMethodIds(orgId);
  const typeOk = SAMPLE_TYPE_IDS(orgId).has(s.typeId) || s.typeId === grandfather?.typeId;
  if (!typeOk) return "Each sample needs a valid sample type.";
  if (!s.description.trim()) return "Each sample needs a description.";
  if (s.quantity && !DECIMAL_PATTERN.test(s.quantity)) {
    return "Sample quantity must be a plain decimal number with a point (e.g. 1.5).";
  }
  for (const id of s.requestedMethodIds) {
    if (!activeMethods.has(id) && !grandfather?.methodIds.includes(id)) {
      return "Each sample's requested methods must be active methods of the organisation.";
    }
  }
  if (s.condition === "deviation" && s.deviationType === "none") {
    return "A deviation must have a type (cosmetic, or does-not-match-description).";
  }
  return null;
}

function validate(actor: JobActor, input: JobInput): string | null {
  if (!input.customer.trim()) return "The customer name is required.";
  if (!input.receivedAt.trim()) return "The date and time of receipt are required.";
  const dueError = dueDateError(input.dueDate);
  if (dueError) return dueError;
  if (input.samples.length < 1) return "A job needs at least one sample.";

  const active = activeMethodIds(actor.orgId);
  for (const id of input.requestedMethodIds) {
    if (!active.has(id)) return "Requested methods must be active methods of the organisation.";
  }

  for (const s of input.samples) {
    const error = validateSample(actor.orgId, s);
    if (error) return error;
  }
  return null;
}

function buildSample(orgId: string, jobNumber: string, receivedAt: string, s: SampleInput): MockSample {
  return {
    id: generateSampleId(orgId, jobNumber, receivedAt),
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
    storageLocation: s.storageLocation.trim(),
    voided: false,
    createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
  };
}

function toListItem(job: MockJob): JobListItem {
  const live = job.samples.filter((s) => !s.voided);
  // Jobs are org-wide: the "lab" shown is the set of labs the work routes to.
  const labNames = [...involvedLabIds(job)]
    .map((id) => mockDb.labs.get(id)?.name ?? id)
    .sort()
    .join(", ");
  return {
    id: job.id,
    customer: job.customer,
    labName: labNames || "—",
    receivedAt: job.receivedAt,
    sampleCount: live.length,
    awaitingDecision: live.filter((s) => s.acceptance === null).length,
    voided: job.voided,
  };
}

// US-C2 AC 7: status from active (accepted, non-voided) samples. Exported so
// the overview and the job-detail header (US-C3 AC 12) share one rule.
export function deriveJobStatus(job: MockJob): JobStatus {
  return deriveStatus(job);
}

/** US-C2 AC 8 / US-C3 AC 2: overdue if the deadline has passed or is within
 * 24h and the job is not completed/voided. */
export function isJobOverdue(job: MockJob): boolean {
  if (job.voided || deriveStatus(job) === "completed" || !job.dueDate) return false;
  const dueTime = new Date(job.dueDate).getTime();
  return !Number.isNaN(dueTime) && dueTime <= Date.now() + 24 * 3600_000;
}

function deriveStatus(job: MockJob): JobStatus {
  if (job.voided) return "closed";
  const live = job.samples.filter((s) => !s.voided);
  const active = live.filter(
    (s) => s.acceptance === "accepted" || s.acceptance === "accepted-with-reservation",
  );
  // No testable samples: all live samples rejected (or none live).
  if (active.length === 0 && live.every((s) => s.acceptance === "rejected")) return "closed";
  // Sample statuses are DERIVED from batch membership (US-D1 AC 4, decision
  // 3 Jul 2026) — the US-C2 aggregation rule itself is unchanged.
  const statuses = active.map((s) => sampleStatus(job.orgId, s));
  if (active.length > 0 && statuses.every((st) => st === "completed")) return "completed";
  // Any active sample that has entered/passed a batch means the job has started
  // (a "completed" sample here implies partial progress — the all-completed
  // branch above already returned; audit findings 1/4/9).
  if (statuses.some((st) => st !== "received" && st !== null)) return "in-progress";
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
  const denied = canManage(actor);
  if (denied) return { error: denied };
  if (job.voided && !opts.allowVoided) {
    return { error: "This job is voided (a closed record) and cannot be changed." };
  }
  return { job };
}

export const mockJobApi: JobApi = {
  async listJobs(actor): Promise<JobListItem[]> {
    return [...mockDb.jobs.values()]
      .filter((j) => j.orgId === actor.orgId && canSee(actor, j))
      .map(toListItem);
  },

  async jobOverview(actor, activeLabId): Promise<JobOverviewRow[]> {
    const now = new Date().getTime();
    const typeNames = new Map(
      getOrgSettings(actor.orgId).sampleTypes.map((t) => [t.id, t.name] as const),
    );
    return [...mockDb.jobs.values()]
      .filter((j) => j.orgId === actor.orgId && canSee(actor, j))
      // Lab filter: null = org-wide, allowed for a support session or an
      // admin's "All labs" view (13 Jul 2026); a lab id shows the jobs whose
      // requested methods route work to that lab. A scoped user with no
      // active lab still gets an empty list, never every lab's jobs
      // (audit finding 5).
      .filter((j) => {
        if (activeLabId === null) return actor.isSupport || actor.role === "admin";
        return involvedLabIds(j).has(activeLabId);
      })
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
    if (!job || job.orgId !== actor.orgId || !canSee(actor, job)) return null;
    return job;
  },

  async createJob(actor, input): Promise<JobActionResult> {
    const denied = canManage(actor);
    if (denied) return { status: "error", message: denied };
    const error = validate(actor, input);
    if (error) return { status: "error", message: error };

    // Consume the immutable job number, then the per-job sample IDs.
    const jobNumber = generateJobNumber(actor.orgId, input.receivedAt);
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
      samples: input.samples.map((s) => buildSample(actor.orgId, jobNumber, input.receivedAt, s)),
      events: [],
    });
    const created = mockDb.jobs.get(jobKey(actor.orgId, jobNumber))!;
    addJobEvent(
      created,
      actor.email,
      `Job created: ${created.samples.length} sample(s) (${created.samples.map((s) => s.id).join(", ")})`,
    );
    return { status: "success", jobId: jobNumber };
  },

  async updateJob(actor, jobId, input): Promise<JobActionResult> {
    const loaded = loadJobForWrite(actor, jobId);
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const { job } = loaded;

    // Header validation. Job-level methods a job ALREADY references stay valid
    // after deactivation; only NEW references must be active (findings 8/12/20).
    if (!input.customer.trim()) return { status: "error", message: "The customer name is required." };
    if (!input.receivedAt.trim()) {
      return { status: "error", message: "The date and time of receipt are required." };
    }
    const dueError = dueDateError(input.dueDate);
    if (dueError) return { status: "error", message: dueError }; // pass-4 fix (see dueDateError)
    const activeMethods = activeMethodIds(actor.orgId);
    for (const id of input.requestedMethodIds) {
      if (!activeMethods.has(id) && !job.requestedMethodIds.includes(id)) {
        return { status: "error", message: "Requested methods must be active methods of the organisation." };
      }
    }

    // Validate every submitted sample BEFORE mutating anything. Submitted ids
    // must belong to this job (a client can never smuggle in a foreign or
    // invented id), and existing samples grandfather their current references.
    const byId = new Map(job.samples.map((s) => [s.id, s]));
    for (const s of input.samples) {
      if (s.id) {
        const existing = byId.get(s.id);
        if (!existing) {
          return { status: "error", message: "Unknown sample in the submission — reload and try again." };
        }
        if (existing.voided) continue; // voided samples are frozen; ignore edits
        const error = validateSample(actor.orgId, s, {
          typeId: existing.typeId,
          methodIds: existing.requestedMethodIds,
        });
        if (error) return { status: "error", message: error };
        // A requested method cannot be REMOVED while the sample sits in an
        // open batch of it — mirror of the acceptance freeze below. US-D1
        // AC 5 makes membership-implies-requested an invariant the batch
        // layer maintains and relies on; un-requesting mid-run would strand
        // the member and falsify job completeness (review fix, pass 2).
        for (const methodId of existing.requestedMethodIds) {
          if (s.requestedMethodIds.includes(methodId)) continue;
          const openBatch = openBatchOfMethodContaining(actor.orgId, existing.id, methodId);
          if (openBatch) {
            return {
              status: "error",
              message: `Sample ${existing.id} is in open batch ${openBatch.id} for one of its requested methods — that method cannot be removed while the batch runs (void the batch or remove the sample from its composition first).`,
            };
          }
        }
      } else {
        const error = validateSample(actor.orgId, s);
        if (error) return { status: "error", message: error };
      }
    }

    // All checks passed — record the before → after diff FIRST (US-C3 AC 5 /
    // invariant 1 — pass-4 review fix: without this, an edit's before-values
    // were unrecoverable and a stale save silently reverted a colleague's
    // changes with no trace), then apply. AC 12: the job number and existing
    // sample IDs never change. An edit can NEVER remove a sample (removal is a
    // void with a reason, US-C3 AC 8): existing samples not present in the
    // submission are retained untouched (never-delete).
    const changes: string[] = [];
    const diff = (label: string, before: string, after: string) => {
      if (before !== after) changes.push(`${label}: "${before}" → "${after}"`);
    };
    diff("customer", job.customer, input.customer.trim());
    diff("customer ref", job.customerRef, input.customerRef.trim());
    diff("received at", job.receivedAt, input.receivedAt);
    diff("priority", job.priority, input.priority.trim());
    diff("deadline", job.dueDate, input.dueDate.trim());
    diff("notes", job.notes, input.notes.trim());
    diff("storage location", job.storageLocation, input.storageLocation.trim());
    diff(
      "requested methods",
      methodCodes(actor.orgId, job.requestedMethodIds),
      methodCodes(actor.orgId, input.requestedMethodIds),
    );
    for (const s of input.samples) {
      if (!s.id) continue;
      const existing = byId.get(s.id)!;
      if (existing.voided) continue;
      const sampleChanges: string[] = [];
      const sdiff = (label: string, before: string, after: string) => {
        if (before !== after) sampleChanges.push(`${label}: "${before}" → "${after}"`);
      };
      sdiff("type", existing.typeId, s.typeId);
      sdiff("description", existing.description, s.description.trim());
      sdiff("customer ref", existing.customerSampleRef, s.customerSampleRef.trim());
      sdiff("quantity", `${existing.quantity} ${existing.quantityUnit}`.trim(), `${s.quantity.trim()} ${s.quantityUnit.trim()}`.trim());
      sdiff(
        "methods",
        methodCodes(actor.orgId, existing.requestedMethodIds),
        methodCodes(actor.orgId, s.requestedMethodIds),
      );
      sdiff("condition", existing.condition, s.condition);
      sdiff("storage", existing.storageLocation, s.storageLocation.trim());
      if (sampleChanges.length > 0) changes.push(`sample ${s.id}: ${sampleChanges.join(", ")}`);
    }

    job.customer = input.customer.trim();
    job.customerRef = input.customerRef.trim();
    job.receivedAt = input.receivedAt;
    job.requestedMethodIds = input.requestedMethodIds;
    job.priority = input.priority.trim();
    job.dueDate = input.dueDate.trim();
    job.notes = input.notes.trim();
    job.storageLocation = input.storageLocation.trim();

    for (const s of input.samples) {
      if (s.id) {
        const existing = byId.get(s.id)!;
        if (!existing.voided) applySampleEdits(existing, s);
      } else {
        const added = buildSample(actor.orgId, job.id, job.receivedAt, s);
        job.samples.push(added);
        changes.push(`sample ${added.id} added (${added.description})`);
      }
    }
    if (changes.length > 0) addJobEvent(job, actor.email, `Job edited: ${changes.join("; ")}`);
    return { status: "success", jobId };
  },

  async setSampleAcceptance(actor, jobId, sampleId, acceptance, reason): Promise<JobActionResult> {
    const loaded = loadJobForWrite(actor, jobId);
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const sample = loaded.job.samples.find((s) => s.id === sampleId);
    if (!sample || sample.voided) return { status: "error", message: "Unknown sample." };

    // Whitelist the decision server-side — a forged value must never become a
    // stored §7.4.3 record (Fable re-review findings 7/13).
    const VALID: SampleAcceptance[] = ["accepted", "accepted-with-reservation", "rejected"];
    if (!VALID.includes(acceptance)) return { status: "error", message: "Invalid acceptance decision." };
    // Once a sample has entered batch processing, its acceptance decision is a
    // frozen part of the record — changes go through epic D's workflows, never
    // a retro-flip that erases lifecycle state (findings 9/26). The lifecycle
    // state is derived from batch membership (US-D1).
    const lifecycle = sampleStatus(loaded.job.orgId, sample);
    if (lifecycle !== null && lifecycle !== "received") {
      return {
        status: "error",
        message: "This sample is already in processing — its acceptance decision can no longer be changed here.",
      };
    }

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

    // Before → after audit line (US-C3 AC 5 / §7.4.3 — pass-4 review fix).
    const before = sample.acceptance ?? "awaiting decision";
    sample.acceptance = acceptance;
    sample.reservationReason = acceptance === "accepted-with-reservation" ? reason.trim() : "";
    addJobEvent(
      loaded.job,
      actor.email,
      `Sample ${sampleId}: acceptance ${before} → ${acceptance}${sample.reservationReason ? ` — ${sample.reservationReason}` : ""}`,
    );
    // AC 9: nothing else to write — the lifecycle status ("received" from the
    // moment of acceptance) is DERIVED from the acceptance decision and batch
    // membership (US-D1 decision 3 Jul 2026).
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
    // §7.4.3 consultation is a domain action → audit line (pass-4 fix).
    addJobEvent(
      loaded.job,
      actor.email,
      `Customer consultation recorded for ${sampleId} (${sample.consultation.who}): ${sample.consultation.outcome}`,
    );
    return { status: "success", jobId };
  },

  async addSample(actor, jobId, input): Promise<JobActionResult> {
    const loaded = loadJobForWrite(actor, jobId);
    if ("error" in loaded) return { status: "error", message: loaded.error };
    const { job } = loaded;
    // Validate ONLY the new sample — never re-check the job's own header
    // state, which may have changed since registration (audit findings 2/4).
    const error = validateSample(actor.orgId, input);
    if (error) return { status: "error", message: error };
    const added = buildSample(actor.orgId, job.id, job.receivedAt, input);
    job.samples.push(added);
    addJobEvent(job, actor.email, `Sample ${added.id} added (${added.description})`); // pass-4 fix
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
    const sha256 = createHash("sha256").update(file.bytes).digest("hex");
    sample.attachments.push({
      id: `att-${sample.attachments.length + 1}-${sample.id}`,
      fileName: file.fileName,
      sizeBytes: file.bytes.length,
      sha256,
      uploadedAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      uploadedBy: actor.email,
    });
    addJobEvent(
      loaded.job,
      actor.email,
      `Evidence added to ${sampleId}: ${file.fileName} (sha256 ${sha256.slice(0, 16)}…)`,
    ); // pass-4 fix
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
    addJobEvent(job, actor.email, `Job voided — ${job.voidReason}`); // pass-4 fix
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
    addJobEvent(job, actor.email, `Sample ${sampleId} voided — ${sample.voidReason}`); // pass-4 fix
    return { status: "success", jobId };
  },
};

import type {
  DeviationType,
  MockJob,
  MockSample,
  SampleAcceptance,
} from "@/lib/mock-db";
import type { OrgRole } from "@/lib/permissions";

// Job / sample operations of US-C1. Mock behind an interface, real backend
// plugs in later. Every rule (ID immutability, method-in-lab validation, the
// §7.4.3 acceptance gate + forced consultation, void-not-delete) must be
// re-enforced by the real backend (invariant 4).

export type JobActor = {
  email: string;
  role: OrgRole;
  labs: string[]; // lab NAMES the user is assigned to
  orgId: string;
  isSupport: boolean;
};

export type SampleInput = {
  id?: string; // present on edit (US-C1 AC 12) — matches an existing sample; absent = new row
  typeId: string;
  description: string;
  customerSampleRef: string;
  quantity: string;
  quantityUnit: string;
  requestedMethodIds: string[];
  condition: "conforming" | "deviation";
  deviationType: DeviationType;
  deviationNote: string;
  storageLocation: string;
};

export type JobInput = {
  labId: string;
  customer: string;
  customerRef: string;
  receivedAt: string;
  requestedMethodIds: string[];
  priority: string;
  dueDate: string;
  notes: string;
  storageLocation: string;
  samples: SampleInput[];
};

export type JobListItem = {
  id: string;
  customer: string;
  labName: string;
  receivedAt: string;
  sampleCount: number;
  awaitingDecision: number;
  voided: boolean;
};

// Derived job status for the overview (US-C2 AC 7), from active (accepted,
// non-voided) samples. Decoupled from the overdue flag (AC 8).
export type JobStatus = "not-started" | "in-progress" | "completed" | "closed";

export type JobOverviewRow = {
  id: string;
  customer: string;
  receivedAt: string;
  dueDate: string;
  sampleTypeLabel: string; // single type name, "Mixed", or "—"
  sampleTypeIds: string[]; // distinct types among non-voided samples (for filtering)
  methodIds: string[]; // union of requested methods, job + samples (for filtering)
  status: JobStatus;
  overdue: boolean; // due passed or within 24h, and not completed (AC 8)
  voided: boolean;
};

export type JobActionResult =
  | { status: "success"; jobId?: string }
  | { status: "error"; message: string };

export interface JobApi {
  listJobs(actor: JobActor): Promise<JobListItem[]>;
  /** US-C2: overview rows scoped to the active lab (null = org-wide, e.g. a
   * support session). Derived status + overdue computed server-side. */
  jobOverview(actor: JobActor, activeLabId: string | null): Promise<JobOverviewRow[]>;
  getJob(actor: JobActor, jobId: string): Promise<MockJob | null>;
  /** Admin / Lab manager only; generates immutable IDs, validates methods. */
  createJob(actor: JobActor, input: JobInput): Promise<JobActionResult>;
  /** Edit header/sample details; IDs never change (AC 12). */
  updateJob(actor: JobActor, jobId: string, input: JobInput): Promise<JobActionResult>;
  /** §7.4.3 acceptance decision with the forced-consultation + reservation gate. */
  setSampleAcceptance(
    actor: JobActor,
    jobId: string,
    sampleId: string,
    acceptance: SampleAcceptance,
    reason: string,
  ): Promise<JobActionResult>;
  /** §7.4.3 customer consultation (required before accepting a mismatch sample). */
  recordConsultation(
    actor: JobActor,
    jobId: string,
    sampleId: string,
    consultation: { who: string; when: string; outcome: string },
  ): Promise<JobActionResult>;
  /** US-C3 AC 7: add one sample to an existing job (new immutable ID); the
   * acceptance decision is recorded afterwards, as at registration. */
  addSample(actor: JobActor, jobId: string, sample: SampleInput): Promise<JobActionResult>;
  /** AC 6: optional deviation evidence via the central attachment facility (ADR-3). */
  addSampleAttachment(
    actor: JobActor,
    jobId: string,
    sampleId: string,
    file: { fileName: string; bytes: Uint8Array },
  ): Promise<JobActionResult>;
  /** Void, never delete (AC 13). */
  voidJob(actor: JobActor, jobId: string, reason: string): Promise<JobActionResult>;
  voidSample(actor: JobActor, jobId: string, sampleId: string, reason: string): Promise<JobActionResult>;
}

/** §7.4.3 batching gate (consumed by epic D): a sample may enter a batch only
 * once accepted (with or without reservation) and not voided; rejected never. */
export function sampleCanBatch(sample: MockSample): boolean {
  if (sample.voided) return false;
  return sample.acceptance === "accepted" || sample.acceptance === "accepted-with-reservation";
}

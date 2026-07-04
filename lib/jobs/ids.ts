import { getOrgSettings, mockDb } from "@/lib/mock-db";
import { renderTemplate } from "@/lib/settings/format-id";

// Identifier generation for jobs and samples (US-C1 AC 2/4, US-A7 AC 3).
// Sequences run per organisation + per lab + per reset period; sample sequences
// restart per job. IDs are consumed on registration and never reissued.

function periodKey(reset: "never" | "yearly" | "monthly", year: number, month: number): string {
  if (reset === "never") return "all";
  if (reset === "monthly") return `${year}-${String(month).padStart(2, "0")}`;
  return `${year}`;
}

function dateTokens(receivedAt: string): { year: number; month: number } {
  const parsed = receivedAt ? new Date(receivedAt) : new Date();
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return { year: base.getFullYear(), month: base.getMonth() + 1 };
}

function jobSequenceKey(orgId: string, labId: string, receivedAt: string): string {
  const reset = getOrgSettings(orgId).identifiers.sequenceReset;
  const { year, month } = dateTokens(receivedAt);
  return `job:${orgId}:${labId}:${periodKey(reset, year, month)}`;
}

/** Preview the next job number WITHOUT consuming a sequence (form header). */
export function peekJobNumber(orgId: string, labId: string, receivedAt: string): string | null {
  const lab = mockDb.labs.get(labId);
  if (!lab || lab.orgId !== orgId) return null;
  const { year, month } = dateTokens(receivedAt);
  const next = (mockDb.sequences.get(jobSequenceKey(orgId, labId, receivedAt)) ?? 0) + 1;
  return renderTemplate(getOrgSettings(orgId).identifiers.jobFormat, {
    lab: lab.code,
    year,
    month,
    seq: next,
  });
}

/** Consume and return the job number (called once, on registration). */
export function generateJobNumber(orgId: string, labId: string, receivedAt: string): string {
  const lab = mockDb.labs.get(labId);
  if (!lab) throw new Error("Unknown lab");
  const key = jobSequenceKey(orgId, labId, receivedAt);
  const next = (mockDb.sequences.get(key) ?? 0) + 1;
  mockDb.sequences.set(key, next);
  const { year, month } = dateTokens(receivedAt);
  return renderTemplate(getOrgSettings(orgId).identifiers.jobFormat, {
    lab: lab.code,
    year,
    month,
    seq: next,
  });
}

/** Consume and return the batch number (US-D1 AC 2; called once, on creation).
 * Same sequence isolation as jobs: per organisation + lab + reset period. */
export function generateBatchNumber(orgId: string, labId: string): string {
  const lab = mockDb.labs.get(labId);
  if (!lab) throw new Error("Unknown lab");
  const reset = getOrgSettings(orgId).identifiers.sequenceReset;
  const { year, month } = dateTokens("");
  const key = `batch:${orgId}:${labId}:${periodKey(reset, year, month)}`;
  const next = (mockDb.sequences.get(key) ?? 0) + 1;
  mockDb.sequences.set(key, next);
  return renderTemplate(getOrgSettings(orgId).identifiers.batchFormat, {
    lab: lab.code,
    year,
    month,
    seq: next,
  });
}

/** Consume and return the next sample ID under a job (restarts per job). The
 * counter key is org-scoped so two organisations sharing a rendered job number
 * never share a sample sequence (audit findings 2/8/12 — invariant 5). */
export function generateSampleId(
  orgId: string,
  jobNumber: string,
  labId: string,
  receivedAt: string,
): string {
  const key = `sample:${orgId}:${jobNumber}`;
  const next = (mockDb.sequences.get(key) ?? 0) + 1;
  mockDb.sequences.set(key, next);
  const { year, month } = dateTokens(receivedAt);
  return renderTemplate(getOrgSettings(orgId).identifiers.sampleFormat, {
    lab: mockDb.labs.get(labId)?.code ?? "",
    year,
    month,
    seq: next,
    job: jobNumber,
  });
}

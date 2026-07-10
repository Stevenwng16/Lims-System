import { mockDb, type MockBatch, type MockSample, type SampleLifecycleStatus } from "@/lib/mock-db";
import { sampleCanBatch } from "@/lib/jobs/types";

// US-D1 AC 4 — the per-(sample × method) progress model, DERIVED on every
// read (decision 3 Jul 2026, Ramazan): computed from open-batch membership,
// batch step position and batch completion. Nothing is stored, so a batch
// void or set-back can never leave a stale status behind — the same
// philosophy as ADR-2 ("current result is a view") and B3's availability.

export type MethodProgress = "received" | "in-batch" | "in-progress" | "completed";

/** Non-voided batches of the organisation containing the sample. */
export function batchesContaining(orgId: string, sampleId: string): MockBatch[] {
  return [...mockDb.batches.values()].filter(
    (b) => b.orgId === orgId && b.status !== "voided" && b.sampleIds.includes(sampleId),
  );
}

/**
 * Progress of one sample for ONE method (AC 4):
 * - completed  — a completed batch of that method contained it (US-D6 completes)
 * - in-progress — in an open batch of that method where work has started
 * - in-batch   — in an open batch of that method still at its first step
 * - received   — in no open/completed batch of that method
 */
export function sampleMethodProgress(
  orgId: string,
  sampleId: string,
  methodId: string,
): MethodProgress {
  // Review fix (pass 2): an OPEN batch of the method outranks an earlier
  // completed one — a structural redo ("a redo is a NEW batch", US-D6) must
  // read as in-batch/in-progress while it runs, not "completed" (US-D1 AC 4
  // "In progress (in ≥1 open batch)" / AC 9). "completed" only stands when no
  // open batch of the method still holds the sample.
  let sawCompleted = false;
  let progress: MethodProgress = "received";
  for (const batch of batchesContaining(orgId, sampleId)) {
    if (batch.methodId !== methodId) continue;
    if (batch.status === "completed") {
      sawCompleted = true;
      continue;
    }
    // Open batch: work started ⇔ the one-way latch has flipped (first step
    // advance or first recorded work, US-D3/D4) — same fact that locks
    // composition, so the two can never disagree.
    if (batch.compositionLatched || batch.currentStepIndex > 0) progress = "in-progress";
    else if (progress === "received") progress = "in-batch";
  }
  if (progress !== "received") return progress;
  return sawCompleted ? "completed" : "received";
}

/**
 * The sample's single visible status (US-C1 AC 9 semantics, aggregated per
 * AC 4): null when not accepted (rejected/undecided never enter the
 * lifecycle); "completed" only when EVERY requested method is completed;
 * otherwise the furthest-along in-flight state. Methods are the union of the
 * requested list and actual batch memberships (AC 5 keeps them in sync; the
 * union is belt-and-braces against historical records).
 */
export function sampleStatus(orgId: string, sample: MockSample): SampleLifecycleStatus | null {
  if (!sampleCanBatch(sample)) return null;
  const methodIds = new Set(sample.requestedMethodIds);
  for (const batch of batchesContaining(orgId, sample.id)) methodIds.add(batch.methodId);
  if (methodIds.size === 0) return "received";

  let sawInProgress = false;
  let sawInBatch = false;
  let allCompleted = true;
  for (const methodId of methodIds) {
    const p = sampleMethodProgress(orgId, sample.id, methodId);
    if (p !== "completed") allCompleted = false;
    if (p === "in-progress") sawInProgress = true;
    if (p === "in-batch") sawInBatch = true;
  }
  if (allCompleted) return "completed";
  if (sawInProgress) return "in-progress";
  if (sawInBatch) return "in-batch";
  return "received";
}

/** US-D1 AC 3(d): the open batch of the SAME method a sample already sits in,
 * if any — one open batch per (sample × method) prevents double work. A batch
 * in Awaiting review (US-D3) still counts: a set-back could reopen its work,
 * so the sample is not free for that method until completion or void. */
export function openBatchOfMethodContaining(
  orgId: string,
  sampleId: string,
  methodId: string,
  excludeBatchId?: string,
): MockBatch | null {
  for (const batch of batchesContaining(orgId, sampleId)) {
    if (batch.methodId !== methodId) continue;
    if (batch.status !== "open" && batch.status !== "awaiting-review") continue;
    if (batch.id === excludeBatchId) continue;
    return batch;
  }
  return null;
}

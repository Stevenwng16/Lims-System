import { notFound, redirect } from "next/navigation";
import { jobApi } from "@/lib/jobs";
import { getOrgSettings } from "@/lib/mock-db";
import { resolveJobActor } from "@/app/(app)/jobs/actions";
import { LabelsPrint, type LabelData } from "./labels-print";

export const metadata = { title: "Print labels" };

// US-C4 barcode printing. Deliberately OUTSIDE the (app) shell so the print
// output is just the labels (no sidebar/header). Still behind auth via proxy.ts.
export default async function LabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sample?: string }>;
}) {
  const { id } = await params;
  const { sample } = await searchParams;
  const actor = await resolveJobActor();
  // Read-only users cannot print (US-C4 authorization); everyone else may
  // (printing is a physical bench task — analysts included).
  if (actor.role === "read-only") redirect(`/jobs/${id}`);

  const job = await jobApi.getJob(actor, id);
  if (!job) notFound();
  // Server-side boundary (invariant 4): no labels for a voided job, even by
  // direct URL — mirrors the write-freeze on closed records.
  if (job.voided) redirect(`/jobs/${id}`);
  const settings = getOrgSettings(actor.orgId);
  const typeNames: Record<string, string> = {};
  for (const t of settings.sampleTypes) typeNames[t.id] = t.name;

  // Active (non-voided) samples in sample-ID order (AC 4); or a single sample.
  // Numeric-aware compare so .002 < .010 < .0100 holds past the pad width.
  let samples = job.samples
    .filter((s) => !s.voided)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const voidedExcluded = job.samples.filter((s) => s.voided).length;
  if (sample) samples = samples.filter((s) => s.id === sample);
  if (samples.length === 0) redirect(`/jobs/${id}`);

  const labels: LabelData[] = samples.map((s) => ({
    sampleId: s.id,
    customer: job.customer,
    typeName: typeNames[s.typeId] ?? s.typeId,
    jobNumber: job.id,
    date: job.receivedAt.slice(0, 10),
  }));

  return (
    <LabelsPrint
      jobId={job.id}
      labels={labels}
      barcode={settings.barcode}
      voidedExcluded={sample ? 0 : voidedExcluded}
    />
  );
}

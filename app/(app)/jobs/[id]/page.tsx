import { notFound } from "next/navigation";
import { batchesForJobSamples } from "@/lib/batches";
import { sampleStatus } from "@/lib/batches/progress";
import { deriveJobStatus, isJobOverdue, jobApi, type JobView } from "@/lib/jobs";
import { labApi } from "@/lib/labs";
import { methodApi } from "@/lib/methods";
import { getOrgSettings, type MockJob } from "@/lib/mock-db";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cookies } from "next/headers";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getOrgIdByName } from "@/lib/mock-db";
import { resolveJobActor } from "../actions";
import { JobDetail, type HistoryEvent } from "./job-detail-client";

// Browser-tab title uses the configured job label (Fable re-review finding 15).
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  const orgId = session ? getOrgIdByName(session.user.organisation) : null;
  const label = orgId ? getOrgSettings(orgId).jobLabel : "Job";
  return { title: `${label} ${id} — LIMS` };
}

// AC 11 / AC 5: the History tab renders the job's REAL append-only audit
// events (pass-4 review fix — it previously reconstructed "illustrative"
// lines from current state, so an edit's before-values were unrecoverable
// and voids showed with no actor or timestamp). Every job mutator now writes
// one attributed event with before → after; this is a pure view of that list.
function jobHistory(job: MockJob): HistoryEvent[] {
  return job.events.map((e) => ({
    when: e.at.slice(0, 16).replace("T", " "),
    who: e.by,
    action: e.summary,
  }));
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await resolveJobActor();
  const job = await jobApi.getJob(actor, id);
  if (!job) notFound();
  // Decorate samples with the DERIVED lifecycle status (US-D1 decision
  // 3 Jul 2026) — the stored record carries none.
  const jobView: JobView = {
    ...job,
    samples: job.samples.map((s) => ({ ...s, status: sampleStatus(job.orgId, s) })),
  };

  const settings = getOrgSettings(actor.orgId);
  const typeNames: Record<string, string> = {};
  for (const t of settings.sampleTypes) typeNames[t.id] = t.name;
  const methodNames: Record<string, string> = {};
  const allMethods = await methodApi.listMethods(actor);
  for (const m of allMethods) methodNames[m.id] = `${m.name} (${m.code})`;

  // A lab manager can only SEE jobs in their own labs (getJob enforces this),
  // so seeing + being a manager ⇒ may manage. Server actions re-check
  // (invariant 4). A read-only support session cannot manage.
  const canManage =
    (actor.role === "admin" || actor.role === "lab-manager") && !job.voided;
  // Printing is a physical bench task: everyone except read-only may print
  // (US-C4 authorization), independent of manage rights — but never for a
  // voided job (a closed record must not get physical labels; audit finding).
  const canPrint = actor.role !== "read-only" && !job.voided;

  // Options for the Add-sample dialog (AC 7): active types + active methods of
  // the job's lab.
  const sampleTypes = settings.sampleTypes.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const labMethods = allMethods
    .filter((m) => m.status === "active" && m.labId === job.labId)
    .map((m) => ({ id: m.id, label: `${m.name} (${m.code})` }));
  const labName = (await labApi.listLabs(actor.orgId)).find((l) => l.id === job.labId)?.name ?? job.labId;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/jobs">{settings.jobLabel}s</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{job.id}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <JobDetail
        job={jobView}
        jobLabel={settings.jobLabel}
        batches={batchesForJobSamples(
          actor.orgId,
          job.samples.map((s) => s.id),
        )}
        labName={labName}
        typeNames={typeNames}
        methodNames={methodNames}
        canManage={canManage}
        canPrint={canPrint}
        status={deriveJobStatus(job)}
        overdue={isJobOverdue(job)}
        history={jobHistory(job)}
        sampleTypes={sampleTypes}
        labMethods={labMethods}
      />
    </div>
  );
}

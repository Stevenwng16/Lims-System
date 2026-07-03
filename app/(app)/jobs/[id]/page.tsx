import { notFound } from "next/navigation";
import { deriveJobStatus, isJobOverdue, jobApi } from "@/lib/jobs";
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

// AC 11: the History tab is a VIEW on the append-only audit log, filtered to
// this job. No audit log exists yet (a backend obligation), so the mock
// reconstructs illustrative events from the current record — clearly labelled
// as such in the UI. Real, timestamped history arrives with the audit log.
function reconstructHistory(job: MockJob): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  events.push({
    when: job.createdAt,
    who: job.createdBy,
    action: `Job created, ${job.samples.length} sample(s) registered`,
  });
  for (const s of job.samples) {
    if (s.consultation) {
      events.push({
        when: s.consultation.recordedAt,
        who: s.consultation.recordedBy,
        action: `Customer consultation recorded for ${s.id} (${s.consultation.who})`,
      });
    }
    if (s.acceptance) {
      const label =
        s.acceptance === "accepted-with-reservation"
          ? `accepted with reservation${s.reservationReason ? ` — ${s.reservationReason}` : ""}`
          : s.acceptance;
      events.push({ when: s.createdAt, who: job.createdBy, action: `Sample ${s.id} ${label}` });
    }
    for (const a of s.attachments) {
      events.push({ when: a.uploadedAt, who: a.uploadedBy, action: `Evidence added to ${s.id}: ${a.fileName}` });
    }
    if (s.voided) {
      events.push({ when: "—", who: "—", action: `Sample ${s.id} voided${s.voidReason ? ` — ${s.voidReason}` : ""}` });
    }
  }
  if (job.voided) {
    events.push({ when: "—", who: "—", action: `Job voided${job.voidReason ? ` — ${job.voidReason}` : ""}` });
  }
  return events;
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await resolveJobActor();
  const job = await jobApi.getJob(actor, id);
  if (!job) notFound();

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
        job={job}
        jobLabel={settings.jobLabel}
        labName={labName}
        typeNames={typeNames}
        methodNames={methodNames}
        canManage={canManage}
        canPrint={canPrint}
        status={deriveJobStatus(job)}
        overdue={isJobOverdue(job)}
        history={reconstructHistory(job)}
        sampleTypes={sampleTypes}
        labMethods={labMethods}
      />
    </div>
  );
}

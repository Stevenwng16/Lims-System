import { notFound } from "next/navigation";
import { jobApi } from "@/lib/jobs";
import { methodApi } from "@/lib/methods";
import { getOrgSettings } from "@/lib/mock-db";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { resolveJobActor } from "../actions";
import { JobDetail } from "./job-detail-client";

export const metadata = { title: "Job — LIMS" };

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await resolveJobActor();
  const job = await jobApi.getJob(actor, id);
  if (!job) notFound();

  const settings = getOrgSettings(actor.orgId);
  const typeNames: Record<string, string> = {};
  for (const t of settings.sampleTypes) typeNames[t.id] = t.name;
  const methodNames: Record<string, string> = {};
  for (const m of await methodApi.listMethods(actor)) methodNames[m.id] = `${m.name} (${m.code})`;

  // A lab manager can only SEE jobs in their own labs (getJob enforces this),
  // so seeing + being a manager ⇒ may manage. The server actions re-check
  // (invariant 4). A read-only support session cannot manage.
  const canManage =
    (actor.role === "admin" || actor.role === "lab-manager") && !job.voided;

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
        typeNames={typeNames}
        methodNames={methodNames}
        canManage={canManage}
      />
    </div>
  );
}

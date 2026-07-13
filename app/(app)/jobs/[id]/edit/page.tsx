import { notFound, redirect } from "next/navigation";
import { labApi } from "@/lib/labs";
import { methodApi } from "@/lib/methods";
import { jobApi } from "@/lib/jobs";
import { getOrgSettings } from "@/lib/mock-db";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { resolveJobActor } from "../../actions";
import { JobForm } from "../../job-form";

export const metadata = { title: "Edit job" };

// AC 12: edit job & sample details; the job number and sample IDs never change.
export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await resolveJobActor();
  if (actor.role !== "admin" && actor.role !== "lab-manager") redirect(`/jobs/${id}`);
  const job = await jobApi.getJob(actor, id);
  if (!job) notFound();
  if (job.voided) redirect(`/jobs/${id}`);

  const settings = getOrgSettings(actor.orgId);
  // Org-wide jobs (13 Jul 2026): all active methods are offered, labelled with
  // the lab that does the work; methods the job already references stay valid.
  const labNames = new Map(
    (await labApi.listLabs(actor.orgId)).map((lab) => [lab.id, lab.name] as const),
  );
  const methods = (await methodApi.listMethods(actor))
    .filter((m) => m.status === "active" || job.samples.some((s) => s.requestedMethodIds.includes(m.id)))
    .map((m) => ({
      id: m.id,
      label: `${m.name} (${m.code}) · ${labNames.get(m.labId) ?? m.labId}`,
    }));
  const sampleTypes = settings.sampleTypes
    .filter((t) => t.active || job.samples.some((s) => s.typeId === t.id))
    .map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/jobs">{settings.jobLabel}s</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/jobs/${job.id}`}>{job.id}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-xl font-semibold text-foreground">
        Edit {settings.jobLabel.toLowerCase()} {job.id}
      </h1>
      <JobForm
        jobLabel={settings.jobLabel}
        methods={methods}
        sampleTypes={sampleTypes}
        mode="edit"
        jobId={job.id}
        jobNumber={job.id}
        initial={{
          customer: job.customer,
          customerRef: job.customerRef,
          receivedAt: job.receivedAt,
          jobMethods: job.requestedMethodIds,
          priority: job.priority,
          dueDate: job.dueDate,
          notes: job.notes,
          storageLocation: job.storageLocation,
          samples: job.samples
            .filter((s) => !s.voided)
            .map((s) => ({
              key: s.id,
              id: s.id,
              typeId: s.typeId,
              description: s.description,
              customerSampleRef: s.customerSampleRef,
              quantity: s.quantity,
              quantityUnit: s.quantityUnit,
              requestedMethodIds: s.requestedMethodIds,
              condition: s.condition,
              deviationType: s.deviationType,
              deviationNote: s.deviationNote,
              storageLocation: s.storageLocation,
            })),
        }}
      />
    </div>
  );
}

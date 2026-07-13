import { redirect } from "next/navigation";
import { labApi } from "@/lib/labs";
import { methodApi } from "@/lib/methods";
import { peekJobNumber } from "@/lib/jobs";
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
import { JobForm } from "../job-form";

export const metadata = { title: "New job" };

export default async function NewJobPage() {
  const actor = await resolveJobActor();
  if (actor.role !== "admin" && actor.role !== "lab-manager") redirect("/jobs");

  const settings = getOrgSettings(actor.orgId);

  // Jobs are org-wide (13 Jul 2026): EVERY active method of the organisation
  // can be requested — the method's lab (shown in the label) routes the work.
  const labNames = new Map(
    (await labApi.listLabs(actor.orgId)).map((lab) => [lab.id, lab.name] as const),
  );
  const methods = (await methodApi.listMethods(actor))
    .filter((m) => m.status === "active")
    .map((m) => ({
      id: m.id,
      label: `${m.name} (${m.code}) · ${labNames.get(m.labId) ?? m.labId}`,
    }));

  const sampleTypes = settings.sampleTypes
    .filter((t) => t.active)
    .map((t) => ({ id: t.id, name: t.name }));

  // Example next number (peek — does not consume the sequence). The real,
  // immutable number is assigned on registration.
  const preview = peekJobNumber(actor.orgId, "");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/jobs">{settings.jobLabel}s</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New {settings.jobLabel.toLowerCase()}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-xl font-semibold text-foreground">
        New {settings.jobLabel.toLowerCase()}
      </h1>
      <JobForm
        jobLabel={settings.jobLabel}
        methods={methods}
        sampleTypes={sampleTypes}
        preview={preview}
      />
    </div>
  );
}

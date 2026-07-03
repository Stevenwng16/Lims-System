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

export const metadata = { title: "New job — LIMS" };

export default async function NewJobPage() {
  const actor = await resolveJobActor();
  if (actor.role !== "admin" && actor.role !== "lab-manager") redirect("/jobs");

  const settings = getOrgSettings(actor.orgId);
  const labs = (await labApi.listLabs(actor.orgId))
    .filter((lab) => lab.status === "active")
    .filter((lab) => actor.role === "admin" || actor.isSupport || actor.labs.includes(lab.name))
    .map((lab) => ({ id: lab.id, name: lab.name }));

  // Active methods with their lab, so the client can offer only the selected
  // lab's methods (AC 14).
  const methods = (await methodApi.listMethods(actor))
    .filter((m) => m.status === "active")
    .map((m) => ({ id: m.id, label: `${m.name} (${m.code})`, labId: m.labId }));

  const sampleTypes = settings.sampleTypes
    .filter((t) => t.active)
    .map((t) => ({ id: t.id, name: t.name }));

  // Example next number per lab (peek — does not consume the sequence). The
  // real, immutable number is assigned on registration.
  const previews: Record<string, string> = {};
  for (const lab of labs) previews[lab.id] = peekJobNumber(actor.orgId, lab.id, "") ?? "";

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
        labs={labs}
        methods={methods}
        sampleTypes={sampleTypes}
        previews={previews}
      />
    </div>
  );
}

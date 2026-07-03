import { redirect } from "next/navigation";
import { labApi } from "@/lib/labs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { resolveMethodActor } from "../actions";
import { MethodForm } from "../method-form";

export const metadata = { title: "New method — LIMS" };

export default async function NewMethodPage() {
  const actor = await resolveMethodActor();
  if (actor.role !== "admin" && actor.role !== "lab-manager") redirect("/methods");

  const labs = (await labApi.listLabs(actor.orgId))
    .filter((lab) => lab.status === "active")
    .filter((lab) => actor.role === "admin" || actor.labs.includes(lab.name))
    .map((lab) => ({ id: lab.id, name: lab.name }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/methods">Methods</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New method</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-xl font-semibold text-foreground">New method</h1>
      <p className="text-sm text-muted-foreground">
        The data-entry template is uploaded on the method page after creation.
      </p>
      <MethodForm
        labs={labs}
        readOnly={false}
        usedByBatches={false}
        initial={{
          name: "",
          code: "",
          labId: labs[0]?.id ?? "",
          description: "",
          accredited: false,
          maxSamplesPerBatch: 20,
          steps: [{ id: "s-initial-1", name: "" }],
          analytes: [{ id: "a-initial-1", name: "", unit: "", decimals: 2, loq: null }],
        }}
      />
    </div>
  );
}

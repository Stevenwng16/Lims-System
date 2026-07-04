import { labApi } from "@/lib/labs";
import { qcApi } from "@/lib/qc";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { resolveQcActor } from "./actions";
import { QcClient } from "./qc-client";

export const metadata = { title: "QC materials — LIMS" };

// Quality ▸ QC materials (US-B2). All org roles view; Admin / Lab manager
// manage within their labs. The pass/fail comparison lives in epic E; adding
// QC to a batch in epic D.
export default async function QcMaterialsPage() {
  const actor = await resolveQcActor();
  const materials = await qcApi.listMaterials(actor);
  const canManage = actor.role === "admin" || actor.role === "lab-manager";

  // Full records for the edit / new-lot dialogs.
  const details: Record<string, NonNullable<Awaited<ReturnType<typeof qcApi.getMaterial>>>> = {};
  for (const item of materials) {
    const full = await qcApi.getMaterial(actor, item.id);
    if (full) details[item.id] = full;
  }

  const labs = (await labApi.listLabs(actor.orgId))
    .filter((lab) => lab.status === "active")
    .filter((lab) => actor.role === "admin" || actor.isSupport || actor.labs.includes(lab.name))
    .map((lab) => ({ id: lab.id, name: lab.name }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/jobs">Jobs</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>Quality</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>QC materials</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <QcClient materials={materials} details={details} labs={labs} canManage={canManage} />
    </div>
  );
}

import { labApi } from "@/lib/labs";
import { equipmentApi } from "@/lib/equipment";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { resolveEquipmentActor } from "./actions";
import { EquipmentClient } from "./equipment-client";

export const metadata = { title: "Equipment — LIMS" };

// Quality ▸ Equipment (US-B3). All org roles view; Admin / Lab manager manage
// within their labs; Analysts log routine checks. The availability state is
// computed server-side on every request — never stored, never cached (AC 6).
export default async function EquipmentPage() {
  const actor = await resolveEquipmentActor();
  const items = await equipmentApi.listEquipment(actor);
  const types = await equipmentApi.listTypes(actor);
  const canManage = actor.role === "admin" || actor.role === "lab-manager";

  const labs = (await labApi.listLabs(actor.orgId))
    .filter((lab) => lab.status === "active")
    .filter((lab) => actor.role === "admin" || actor.isSupport || actor.labs.includes(lab.name))
    .map((lab) => ({ id: lab.id, name: lab.name }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/jobs">Jobs</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>Quality</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Equipment</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <EquipmentClient
        items={items}
        types={types.map((t) => ({ id: t.id, name: t.name, status: t.status }))}
        labs={labs}
        canManage={canManage}
        canManageTypes={actor.role === "admin"}
      />
    </div>
  );
}

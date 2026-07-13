import { notFound } from "next/navigation";
import { equipmentApi } from "@/lib/equipment";
import { labApi } from "@/lib/labs";
import { methodApi } from "@/lib/methods";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { resolveEquipmentActor } from "../actions";
import { EquipmentDetailClient } from "./detail-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await resolveEquipmentActor();
  const detail = await equipmentApi.getEquipment(actor, id);
  return { title: detail ? `${detail.record.assetId} — Equipment` : "Equipment" };
}

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await resolveEquipmentActor();
  const detail = await equipmentApi.getEquipment(actor, id);
  if (!detail) notFound();

  const canManage = actor.role === "admin" || actor.role === "lab-manager";
  const canLog = actor.role !== "read-only";

  const types = await equipmentApi.listTypes(actor);
  // Active types for the edit dialog, plus the current one when it is
  // inactive (grandfathered) so the Select still shows it.
  const typeOptions = types
    .filter((t) => t.status === "active" || t.id === detail.record.typeId)
    .map((t) => ({ id: t.id, name: t.status === "active" ? t.name : `${t.name} (inactive)` }));

  const labs = (await labApi.listLabs(actor.orgId))
    .filter((lab) => actor.role === "admin" || actor.isSupport || actor.labs.includes(lab.name))
    .filter((lab) => lab.status === "active" || lab.id === detail.record.labId)
    .map((lab) => ({
      id: lab.id,
      name: lab.status === "active" ? lab.name : `${lab.name} (inactive)`,
    }));

  // Link candidates (AC 10): ACTIVE methods of the equipment's lab, with their
  // current-version process steps. Existing links to other methods stay
  // visible via detail.links (grandfathered).
  const methodActor = { email: actor.email, role: actor.role, labs: actor.labs, orgId: actor.orgId };
  const methodList = await methodApi.listMethods(methodActor);
  const linkableMethods: { id: string; name: string; steps: { id: string; name: string }[] }[] = [];
  for (const m of methodList) {
    if (m.status !== "active" || m.labId !== detail.record.labId) continue;
    const full = await methodApi.getMethod(methodActor, m.id);
    if (!full) continue;
    linkableMethods.push({
      id: m.id,
      name: `${full.current.name} (${full.current.code})`,
      steps: full.current.steps.map((s) => ({ id: s.id, name: s.name })),
    });
  }

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
            <BreadcrumbLink href="/quality/equipment">Equipment</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{detail.record.assetId}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <EquipmentDetailClient
        detail={detail}
        typeOptions={typeOptions}
        labOptions={labs}
        linkableMethods={linkableMethods}
        canManage={canManage}
        canLog={canLog}
      />
    </div>
  );
}

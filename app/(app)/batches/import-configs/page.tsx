import { redirect } from "next/navigation";
import { batchApi } from "@/lib/batches";
import { labApi } from "@/lib/labs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { resolveBatchActor } from "../actions";
import { ImportConfigsClient } from "./configs-client";

export const metadata = { title: "Import configurations" };

// US-D5 AC 1 — lab-level masterdata: Admin / Lab manager manage the mappings
// instrument exports are read with. Listed under the masterdata scoping
// exemption (triage decision 11, 17 Jul 2026), like QC materials: all the
// user's labs at once, org-wide for admins — no active-lab dead end.
export default async function ImportConfigsPage() {
  const actor = await resolveBatchActor();
  if (actor.role !== "admin" && actor.role !== "lab-manager") redirect("/batches");

  const configs = await batchApi.listImportConfigs(actor, null);
  const labs = (await labApi.listLabs(actor.orgId))
    .filter((lab) => lab.status === "active")
    .filter((lab) => actor.role === "admin" || actor.isSupport || actor.labs.includes(lab.name))
    .map((lab) => ({ id: lab.id, name: lab.name }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/batches">Batches</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Import configurations</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-xl font-semibold text-foreground">Import configurations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How instrument exports are read: orientation, column mapping (with units — the
          factor-1000 guard) and the declared separators. Declared, never auto-detected (ADR-4).
        </p>
      </div>
      <ImportConfigsClient labs={labs} configs={configs} />
    </div>
  );
}

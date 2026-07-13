import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { batchApi } from "@/lib/batches";
import { activeLabsForUser, LAB_COOKIE, resolveActiveLab } from "@/lib/lab";
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
// instrument exports are read with. Scoped to the ACTIVE lab (work context).
export default async function ImportConfigsPage() {
  const actor = await resolveBatchActor();
  if (actor.role !== "admin" && actor.role !== "lab-manager") redirect("/batches");

  const cookieStore = await cookies();
  const activeLab = actor.isSupport
    ? null
    : resolveActiveLab(activeLabsForUser(actor.labs, actor.orgId), cookieStore.get(LAB_COOKIE)?.value);
  if (!activeLab) redirect("/batches");

  const configs = await batchApi.listImportConfigs(actor, activeLab.id);

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
        <h1 className="text-xl font-semibold text-foreground">
          Import configurations — {activeLab.name} lab
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How instrument exports are read: orientation, column mapping (with units — the
          factor-1000 guard) and the declared separators. Declared, never auto-detected (ADR-4).
        </p>
      </div>
      <ImportConfigsClient labId={activeLab.id} configs={configs} />
    </div>
  );
}

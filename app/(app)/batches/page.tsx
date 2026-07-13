import Link from "next/link";
import { cookies } from "next/headers";
import { batchApi, stepNameOptionsForLab } from "@/lib/batches";
import { activeLabsForUser, LAB_COOKIE, resolveActiveLab } from "@/lib/lab";
import { mockDb } from "@/lib/mock-db";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { resolveBatchActor } from "./actions";
import { BatchQueue } from "./batches-client";

export const metadata = { title: "Batches" };

// US-D1 batch list — a work screen, scoped to the active lab (US-A3 AC 4).
// US-D2 turns this into the prioritised work queue.
export default async function BatchesPage() {
  const actor = await resolveBatchActor();
  const cookieStore = await cookies();
  const activeLab = actor.isSupport
    ? null
    : resolveActiveLab(activeLabsForUser(actor.labs, actor.orgId), cookieStore.get(LAB_COOKIE)?.value);

  const rows = await batchApi.listBatches(actor, actor.isSupport ? null : (activeLab?.id ?? null));
  // US-D2 AC 4: step filter over the lab's active methods' step names.
  const stepOptions = activeLab ? stepNameOptionsForLab(actor.orgId, activeLab.id) : [];

  // Coarse button visibility only — the method-level rules (analyst clearance)
  // are enforced server-side and on the New-batch page itself.
  const canCreate =
    actor.role === "admin" ||
    actor.role === "lab-manager" ||
    (actor.role === "analyst" &&
      activeLab !== null &&
      (mockDb.labs.get(activeLab.id)?.analystsMayCreateBatches ?? false));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Batches</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Batches</h1>
          <p className="text-sm text-muted-foreground">
            {actor.isSupport
              ? "All labs (support session)"
              : activeLab
                ? `${activeLab.name} lab`
                : "No active lab"}
          </p>
        </div>
        <div className="flex gap-2">
          {(actor.role === "admin" || actor.role === "lab-manager") && activeLab && (
            <Button size="sm" variant="outline" render={<Link href="/batches/import-configs" />}>
              Import configurations
            </Button>
          )}
          {canCreate && activeLab && (
            <Button size="sm" render={<Link href="/batches/new" />}>
              + New batch
            </Button>
          )}
        </div>
      </div>

      <BatchQueue rows={rows} stepOptions={stepOptions} />
    </div>
  );
}

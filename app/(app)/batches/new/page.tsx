import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { batchApi } from "@/lib/batches";
import { activeLabsForUser, LAB_COOKIE, resolveActiveLab } from "@/lib/lab";
import { getOrgSettings } from "@/lib/mock-db";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { resolveBatchActor } from "../actions";
import { NewBatchForm } from "./new-batch-client";

export const metadata = { title: "New batch" };

// US-D1 — assemble a batch in the ACTIVE lab: method (latest version pinned),
// eligible samples, QC with quantities, live capacity counter. All rules are
// enforced again server-side on submit (invariant 4).
export default async function NewBatchPage() {
  const actor = await resolveBatchActor();
  if (actor.role === "read-only") redirect("/batches");

  const cookieStore = await cookies();
  const activeLab = actor.isSupport
    ? null
    : resolveActiveLab(
        activeLabsForUser(actor.labs, actor.orgId, actor.role),
        cookieStore.get(LAB_COOKIE)?.value,
        actor.role === "admin",
      );
  // Batch creation needs a concrete lab context — a support session without
  // one (org-wide) registers no bench work.
  if (!activeLab) redirect("/batches");

  const methods = await batchApi.creationOptions(actor, activeLab.id);
  const jobLabel = getOrgSettings(actor.orgId).jobLabel;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/batches">Batches</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New batch</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-xl font-semibold text-foreground">New batch — {activeLab.name} lab</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The method&apos;s latest active version is pinned at creation and never changes on this
          batch. Samples and QC each occupy a position; the working copy is generated on create.
        </p>
      </div>

      <NewBatchForm labId={activeLab.id} methods={methods} jobLabel={jobLabel} />
    </div>
  );
}

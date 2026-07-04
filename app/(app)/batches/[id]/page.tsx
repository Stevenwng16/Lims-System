import { notFound } from "next/navigation";
import { assignableUsersForBatch, batchApi, canComposeBatch, canWorkBatch } from "@/lib/batches";
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
import { BatchDetailClient } from "./batch-detail-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Batch ${id} — LIMS` };
}

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await resolveBatchActor();
  const detail = await batchApi.getBatch(actor, id);
  if (!detail) notFound();

  // Same limits for composition editing as for creation (US-D1 authorization);
  // the server action re-checks (invariant 4).
  const canEdit =
    detail.compositionOpen &&
    canComposeBatch(actor, detail.record.labId, detail.record.methodId) === null;
  // US-D3: work = Admin / Lab manager / cleared Analyst; set-back & void =
  // Admin / Lab manager only. Presentation flags — the server re-enforces.
  const canWork = canWorkBatch(actor, detail.record) === null;
  const canManage =
    (actor.role === "admin" || actor.role === "lab-manager") &&
    (actor.role === "admin" || actor.isSupport || actor.labs.includes(detail.labName));
  const downloadable = (await batchApi.workingCopyFile(actor, id)) !== null;
  const jobLabel = getOrgSettings(actor.orgId).jobLabel;
  // US-D4: the results grid (entry rights = same canWork rule; the grid
  // itself is visible to every role that sees the batch, read-only included).
  const grid = await batchApi.resultsGrid(actor, id);
  // US-D2 AC 8: the manager's assign dialog offers only users allowed to
  // work this batch (the server re-checks on submit anyway).
  const assignableUsers = canManage ? assignableUsersForBatch(actor.orgId, id) : [];
  // US-D5: active import configurations of the batch's lab.
  const importConfigs = (await batchApi.listImportConfigs(actor, detail.record.labId))
    .filter((c) => c.status === "active")
    .map((c) => ({ id: c.id, name: c.name, fileType: c.fileType }));
  // US-D6: the review view replaces the entry grid once the batch has left
  // its working phase (awaiting review / completed / voided).
  const review = detail.record.status === "open" ? null : await batchApi.reviewView(actor, id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/batches">Batches</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{id}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <BatchDetailClient
        detail={detail}
        grid={grid}
        canEdit={canEdit}
        canWork={canWork}
        canManage={canManage}
        downloadable={downloadable}
        jobLabel={jobLabel}
        actorEmail={actor.email}
        assignableUsers={assignableUsers}
        importConfigs={importConfigs}
        review={review}
      />
    </div>
  );
}

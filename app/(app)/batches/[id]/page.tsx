import { notFound } from "next/navigation";
import { batchApi, canComposeBatch, canWorkBatch } from "@/lib/batches";
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
        canEdit={canEdit}
        canWork={canWork}
        canManage={canManage}
        downloadable={downloadable}
        jobLabel={jobLabel}
      />
    </div>
  );
}

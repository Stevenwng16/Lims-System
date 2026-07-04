import { notFound } from "next/navigation";
import { batchApi, canComposeBatch } from "@/lib/batches";
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
        downloadable={downloadable}
        jobLabel={jobLabel}
      />
    </div>
  );
}

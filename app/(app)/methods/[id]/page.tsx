import { notFound } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";
import { resolveMethodActor } from "../actions";
import { MethodForm } from "../method-form";
import { MethodStatusForm, TemplateSection } from "./method-detail-client";

export const metadata = { title: "Method — LIMS" };

export default async function MethodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await resolveMethodActor();
  const method = await methodApi.getMethod(actor, id);
  if (!method) notFound();

  const canManage =
    actor.role === "admin" ||
    (actor.role === "lab-manager" &&
      actor.labs.includes(
        (await labApi.listLabs(actor.orgId)).find((l) => l.id === method.current.labId)?.name ?? "",
      ));

  const labs = (await labApi.listLabs(actor.orgId))
    .filter((lab) => lab.status === "active" || lab.id === method.current.labId)
    .filter((lab) => actor.role === "admin" || actor.labs.includes(lab.name))
    .map((lab) => ({ id: lab.id, name: lab.name }));

  const currentTemplate = method.templates.find(
    (t) => t.version === method.current.templateVersion,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/methods">Methods</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{method.current.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {canManage ? "Edit method" : "Method"} — {method.current.name}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            Version {method.current.version} ({method.status})
            {method.usedByBatches && <Badge variant="outline">in use by batches</Badge>}
            {method.versionCount > 1 && (
              <span>· {method.versionCount} versions retained for traceability</span>
            )}
          </p>
          {method.status === "inactive" && method.statusReason && (
            <p className="mt-1 text-sm text-muted-foreground">
              Deactivation reason: {method.statusReason}
            </p>
          )}
        </div>
        {canManage && <MethodStatusForm methodId={method.id} status={method.status} />}
      </div>

      <MethodForm
        methodId={method.id}
        labs={labs}
        readOnly={!canManage}
        usedByBatches={method.usedByBatches}
        initial={{
          name: method.current.name,
          code: method.current.code,
          labId: method.current.labId,
          description: method.current.description,
          accredited: method.current.accredited,
          maxSamplesPerBatch: method.current.maxSamplesPerBatch,
          steps: method.current.steps.map((s) => ({ id: s.id, name: s.name })),
          analytes: method.current.analytes,
        }}
      />

      <TemplateSection
        methodId={method.id}
        canManage={canManage}
        usedByBatches={method.usedByBatches}
        currentTemplate={currentTemplate ?? null}
        history={method.templates}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { resolveOrgContext } from "@/lib/auth/context";
import { labApi } from "@/lib/labs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { LabsClient } from "./labs-client";

export const metadata = { title: "Labs — LIMS" };

// Admin ▸ Labs (US-A5): list, create, edit, activate/deactivate. Labs are
// never deleted (invariant 2).
export default async function LabsPage() {
  const ctx = await resolveOrgContext();
  if (ctx.role !== "admin" || !ctx.orgId) redirect("/");
  const labs = await labApi.listLabs(ctx.orgId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/jobs">Jobs</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>Admin</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Labs</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <LabsClient labs={labs} />
    </div>
  );
}

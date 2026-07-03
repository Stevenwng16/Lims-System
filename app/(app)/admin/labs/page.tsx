import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { decodeSupportSession, SUPPORT_COOKIE } from "@/lib/platform/support-session";
import { effectiveOrgRole } from "@/lib/permissions";
import { getOrgIdByName } from "@/lib/mock-db";
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
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  const supportSession = decodeSupportSession(cookieStore.get(SUPPORT_COOKIE)?.value);
  if (effectiveOrgRole(session.user, supportSession) !== "admin") redirect("/");

  const orgId = supportSession?.orgId ?? getOrgIdByName(session.user.organisation);
  if (!orgId) redirect("/");
  const labs = await labApi.listLabs(orgId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
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

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { platformApi } from "@/lib/platform";
import { requireOrgAdmin } from "./actions";
import { SupportAccessForm } from "./support-access-form";

export const metadata = { title: "Support access" };

// Module-level (not in render) so the clock read stays outside the component
// (react-hooks/purity — 17 Jul 2026 lint cleanup); liveness derives from the
// timestamp, never a sticky flag (audit finding 27).
function isSessionActive(grant: Awaited<ReturnType<typeof platformApi.getSupportGrant>>): boolean {
  return !!grant && grant.sessionExpiresAt !== null && grant.sessionExpiresAt > Date.now();
}

// Customer side of US-A2 AC 8/9. Real Admin only (live-checked in
// requireOrgAdmin) — grant management stays with the customer even during an
// admin-rights support session.
export default async function SupportAccessPage() {
  const orgId = await requireOrgAdmin(); // redirects unless a live org admin
  const grant = await platformApi.getSupportGrant(orgId);
  const sessionActive = isSessionActive(grant);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/jobs">Jobs</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/settings">Settings</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Support access</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-xl font-semibold text-foreground">Vendor support access</h1>
      <SupportAccessForm
        grant={
          grant && {
            expiresAt: grant.expiresAt,
            allowAdmin: grant.allowAdmin,
            sessionActive,
          }
        }
      />
    </div>
  );
}

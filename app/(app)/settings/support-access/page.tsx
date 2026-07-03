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

export const metadata = { title: "Support access — LIMS" };

// Customer side of US-A2 AC 8/9. Real Admin only (live-checked in
// requireOrgAdmin) — grant management stays with the customer even during an
// admin-rights support session.
export default async function SupportAccessPage() {
  const orgId = await requireOrgAdmin(); // redirects unless a live org admin
  const grant = await platformApi.getSupportGrant(orgId);
  const sessionActive =
    !!grant && grant.sessionExpiresAt !== null && grant.sessionExpiresAt > Date.now();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
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

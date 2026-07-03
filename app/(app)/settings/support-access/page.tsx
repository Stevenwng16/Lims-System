import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { platformApi } from "@/lib/platform";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SupportAccessForm } from "./support-access-form";

export const metadata = { title: "Support access — LIMS" };

// Customer side of US-A2 AC 8/9. Lives under Settings; the full Settings
// area arrives with US-A7 — until then this page stands alone.
export default async function SupportAccessPage() {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  // Real Admin only — grant management stays with the customer even during
  // an admin-rights support session (see actions.ts).
  if (session?.user.role !== "admin") redirect("/");

  const orgId = session.user.organisation === "Demo Lab" ? "org-demolab" : "org-unknown";
  const grant = await platformApi.getSupportGrant(orgId);

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
            sessionActive: grant.sessionActive,
          }
        }
      />
    </div>
  );
}

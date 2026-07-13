import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { PRODUCT_NAME } from "@/lib/branding";
import { platformApi } from "@/lib/platform";
import { logoutAction } from "../(auth)/actions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { OrganisationTable } from "./organisation-table";
import { ProvisionDialog } from "./provision-dialog";

export const metadata = { title: "Platform console" };

// Vendor-only internal tool (US-A2 AC 12). Deliberately minimal: list,
// provisioning, suspend/reactivate, support-grant status. Never shows
// customer domain data (AC 10).
export default async function PlatformConsolePage() {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (session?.user.role !== "platform-admin") redirect("/");

  const organisations = await platformApi.listOrganisations();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold tracking-tight text-primary">{PRODUCT_NAME}</span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Platform console · vendor-only
            </span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <span className="text-sm text-zinc-600 dark:text-zinc-300">{session.user.name}</span>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                Log out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Organisations
          </h1>
          <ProvisionDialog />
        </div>
        <OrganisationTable organisations={organisations} />
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Platform admins see organisation metadata only. Domain data is accessible exclusively
          through a customer-granted support session, recorded in the customer&apos;s audit log.
        </p>
      </main>
    </div>
  );
}

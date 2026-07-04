import { cookies } from "next/headers";
import { logoutAction } from "../(auth)/actions";
import { setActiveLabAction } from "./actions";
import { resolveOrgContext } from "@/lib/auth/context";
import { activeLabsForUser, LAB_COOKIE, resolveActiveLab } from "@/lib/lab";
import { ROLE_LABELS } from "@/lib/permissions";
import { AppSidebar } from "@/components/app-sidebar";
import { LabSwitcher } from "@/components/lab-switcher";
import { SupportBanner } from "@/components/support-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

// The one consistent shell every authenticated screen renders in (US-A3 AC 1).
// Unauthenticated pages live in the (auth) group and never get it.
export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const ctx = await resolveOrgContext(); // live-validated; redirects a dead session
  const { user } = ctx;
  const cookieStore = await cookies();

  // Active-lab context for org members (US-A3 AC 4); during a vendor support
  // session, data screens are org-wide by design, so the shell shows an
  // explicit "All labs" chip instead of a switcher (audit finding 16).
  const assignedLabs = ctx.isSupport ? [] : activeLabsForUser(ctx.labs, ctx.orgId);
  const labCookie = cookieStore.get(LAB_COOKIE)?.value;
  const activeLab = resolveActiveLab(assignedLabs, labCookie);
  // The cookie points at a lab no longer available (deactivated/unassigned):
  // the fallback must be visible, never silent — working-in-the-wrong-lab is a
  // compliance risk (US-A3 AC 4/10; Fable re-review finding 3). Acknowledging
  // rewrites the cookie to the fallback via setActiveLabAction.
  const labWasReset = !ctx.isSupport && !!labCookie && !!activeLab && labCookie !== activeLab.id;

  // AC 8: collapse preference persists — the sidebar writes this cookie.
  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultOpen = sidebarState !== "false";

  const orgLabel = ctx.isSupport
    ? `${ctx.support?.orgName} (support)`
    : user.organisation;

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar role={ctx.role} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
          <SidebarTrigger aria-label="Toggle sidebar" />
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">{orgLabel}</span>
            {ctx.isSupport ? (
              <span className="text-sm text-muted-foreground">All labs</span>
            ) : (
              activeLab && <LabSwitcher labs={assignedLabs} activeLabId={activeLab.id} />
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <span className="text-sm text-muted-foreground">
              {user.name} ({ROLE_LABELS[user.role]})
            </span>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                Log out
              </Button>
            </form>
          </div>
        </header>
        {/* System-message area (AC 6): support banner + global notices; invisible when empty. */}
        <SupportBanner />
        {labWasReset && activeLab && (
          <div className="flex items-center justify-center gap-3 bg-amber-100 px-4 py-1.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <span>Your active lab was reset to {activeLab.name}.</span>
            <form action={setActiveLabAction}>
              <input type="hidden" name="lab" value={activeLab.id} />
              <Button type="submit" variant="ghost" size="xs">
                OK
              </Button>
            </form>
          </div>
        )}
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

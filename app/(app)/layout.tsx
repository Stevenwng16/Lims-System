import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logoutAction } from "../(auth)/actions";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { LAB_COOKIE, resolveActiveLab } from "@/lib/lab";
import { mockDb } from "@/lib/mock-db";
import { decodeSupportSession, SUPPORT_COOKIE } from "@/lib/platform/support-session";
import { AppSidebar } from "@/components/app-sidebar";
import { LabSwitcher } from "@/components/lab-switcher";
import { SupportBanner } from "@/components/support-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

const roleLabels = {
  "org-admin": "Admin",
  "org-member": "Member",
  "platform-admin": "Vendor support",
} as const;

// The one consistent shell every authenticated screen renders in (US-A3 AC 1).
// Unauthenticated pages live in the (auth) group and never get it.
export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login"); // proxy already guards; this narrows types

  const { user } = session;
  const supportSession = decodeSupportSession(cookieStore.get(SUPPORT_COOKIE)?.value);
  const labs = mockDb.users.get(user.email)?.labs ?? [];
  const activeLab = resolveActiveLab(labs, cookieStore.get(LAB_COOKIE)?.value);

  // AC 8: collapse preference persists — the sidebar writes this cookie.
  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultOpen = sidebarState !== "false";

  const orgLabel =
    user.role === "platform-admin" && supportSession
      ? `${supportSession.orgName} (support)`
      : user.organisation;

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar role={user.role} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
          <SidebarTrigger aria-label="Toggle sidebar" />
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">{orgLabel}</span>
            {activeLab && <LabSwitcher labs={labs} activeLab={activeLab} />}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <span className="text-sm text-muted-foreground">
              {user.name} ({roleLabels[user.role]})
            </span>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                Log out
              </Button>
            </form>
          </div>
        </header>
        {/* System-message area (AC 6): support banner + future global notices; invisible when empty. */}
        <SupportBanner />
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

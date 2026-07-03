"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, Home, Settings, ShieldCheck } from "lucide-react";
import { can, type Capability, type OrgRole } from "@/lib/permissions";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

// US-A3 AC 2: the target structure is Jobs / Batches / Quality / Methods /
// Reports / Admin — items appear only once their feature exists, so the
// phase-1 sidebar is small and grows per story without layout rework.
// Visibility follows the US-A4 capability matrix (AC 12) and is presentation
// only — the server enforces the same matrix.

type NavItem = {
  title: string;
  href: string;
  icon: typeof Home;
  requires?: Capability;
};

const mainItems: NavItem[] = [{ title: "Home", href: "/", icon: Home }];

const adminItems: NavItem[] = [
  { title: "Roles & permissions", href: "/admin/roles", icon: ShieldCheck, requires: "org-settings" },
  { title: "Settings", href: "/settings/support-access", icon: Settings, requires: "org-settings" },
];

function visible(items: NavItem[], role: OrgRole | null): NavItem[] {
  return items.filter((item) => !item.requires || (role !== null && can(role, item.requires)));
}

export function AppSidebar({ role }: { role: OrgRole | null }) {
  const pathname = usePathname();
  const admin = visible(adminItems, role);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <FlaskConical className="size-5 shrink-0 text-primary" />
          <span className="text-lg font-semibold tracking-tight text-primary group-data-[collapsible=icon]:hidden">
            LIMS
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible(mainItems, role).map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    tooltip={item.title}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {admin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {admin.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={pathname.startsWith(item.href)}
                      tooltip={item.title}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

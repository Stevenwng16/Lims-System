"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, Home, Settings } from "lucide-react";
import type { UserRole } from "@/lib/auth";
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
// Visibility is role-aware presentation only (AC 3); the server enforces.

const mainItems = [{ title: "Home", href: "/", icon: Home }];

const adminItems = [
  { title: "Settings", href: "/settings/support-access", icon: Settings },
];

export function AppSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();

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
              {mainItems.map((item) => (
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
        {role === "org-admin" && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
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

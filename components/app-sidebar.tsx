"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/branding";
import type { OrgRole } from "@/lib/permissions";
import { adminNav, isActiveNav, mainNav, visibleNav } from "@/lib/navigation";
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

// The sidebar renders the shared navigation config (lib/navigation.ts). US-A3
// AC 2: sections appear only once their feature exists; visibility follows the
// US-A4 capability matrix (AC 12) and is presentation only — the server
// enforces the same matrix.
export function AppSidebar({ role }: { role: OrgRole | null }) {
  const pathname = usePathname();
  const admin = visibleNav(adminNav, role);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <FlaskConical className="size-5 shrink-0 text-primary" />
          <span className="text-lg font-semibold tracking-tight text-primary group-data-[collapsible=icon]:hidden">
            {PRODUCT_NAME}
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNav(mainNav, role).map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActiveNav(item.href, pathname)}
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
                      isActive={isActiveNav(item.href, pathname)}
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

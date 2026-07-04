import {
  Beaker,
  Building2,
  ClipboardList,
  FlaskRound,
  Layers,
  Microscope,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { can, type Capability, type OrgRole } from "@/lib/permissions";

// Single source of truth for the navigation structure (US-A3 AC 2), consumed
// by the sidebar. Items appear only once their feature exists; the list grows
// per story without layout rework. Visibility follows the US-A4 capability
// matrix.

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  requires?: Capability;
  // For items whose access is scoped rather than matrix-flat (US-A6: lab
  // managers manage Analyst/Read-only users in their labs, though the coarse
  // "Manage users" matrix row is Admin-only).
  visibleFor?: OrgRole[];
};

export const mainNav: NavItem[] = [
  { title: "Jobs", href: "/jobs", icon: ClipboardList, requires: "view-data" },
  // Batches (US-D1): creation now; US-D2 turns the list into the work queue.
  { title: "Batches", href: "/batches", icon: Layers, requires: "view-data" },
  // The US-A3 "Quality" section: QC materials (US-B2) + Equipment (US-B3).
  // Analysts need Equipment too — they log the routine checks (view-data
  // covers every org role; writes are gated server-side per US-B3).
  { title: "QC materials", href: "/quality/qc-materials", icon: FlaskRound, requires: "view-data" },
  { title: "Equipment", href: "/quality/equipment", icon: Microscope, requires: "view-data" },
  { title: "Methods", href: "/methods", icon: Beaker, requires: "view-data" },
];

export const adminNav: NavItem[] = [
  { title: "Roles & permissions", href: "/admin/roles", icon: ShieldCheck, requires: "org-settings" },
  { title: "Users", href: "/admin/users", icon: Users, visibleFor: ["admin", "lab-manager"] },
  { title: "Labs", href: "/admin/labs", icon: Building2, requires: "org-settings" },
  { title: "Settings", href: "/settings", icon: Settings, requires: "org-settings" },
];

export function visibleNav(items: NavItem[], role: OrgRole | null): NavItem[] {
  return items.filter((item) => {
    if (role === null) return !item.requires && !item.visibleFor;
    if (item.visibleFor) return item.visibleFor.includes(role);
    if (item.requires) return can(role, item.requires);
    return true;
  });
}

// Section-highlight matcher (US-A3 AC 7): a section matches its own route and
// its nested routes (e.g. /methods/new), with a segment boundary so /settings
// never matches a hypothetical /settings-foo (audit finding 12).
export function isActiveNav(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

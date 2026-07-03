import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Check, Minus } from "lucide-react";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { decodeSupportSession, SUPPORT_COOKIE } from "@/lib/platform/support-session";
import { CAPABILITY_ROWS, effectiveOrgRole, ROLE_LABELS, type OrgRole } from "@/lib/permissions";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Roles & permissions — LIMS" };

const roleOrder: OrgRole[] = ["admin", "lab-manager", "analyst", "read-only"];

function CellValue({ value }: { value: boolean | "cleared-only" | "per-lab-setting" }) {
  if (value === true) return <Check aria-label="allowed" className="mx-auto size-4 text-primary" />;
  if (value === "cleared-only") return <span className="block text-center">✓ *</span>;
  if (value === "per-lab-setting") return <span className="block text-center">– †</span>;
  return <Minus aria-label="not allowed" className="mx-auto size-4 text-muted-foreground/50" />;
}

// Read-only reference of the US-A4 capability matrix (single source of truth:
// lib/permissions.ts — this page renders it, never redefines it). Editable
// role assignment and clearances live in User management (US-A6).
export default async function RolesPage() {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  const supportSession = decodeSupportSession(cookieStore.get(SUPPORT_COOKIE)?.value);
  const role = effectiveOrgRole(session.user, supportSession);
  if (role !== "admin") redirect("/");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>Admin</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Roles &amp; permissions</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-xl font-semibold text-foreground">Roles &amp; permissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The four standard roles and what each may do. Role assignment and method clearances are
          managed per user in User management. Every capability is also enforced server-side —
          hiding a button is never the security boundary.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Capability</TableHead>
              {roleOrder.map((r) => (
                <TableHead key={r} className="text-center">
                  {ROLE_LABELS[r]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {CAPABILITY_ROWS.map((row) => (
              <TableRow key={row.capability}>
                <TableCell className="font-medium">{row.label}</TableCell>
                {roleOrder.map((r) => (
                  <TableCell key={r}>
                    <CellValue value={row.roles[r]} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        <p>* Analyst: only for methods the user is individually cleared for.</p>
        <p>
          † Configurable per lab (default off, Settings — US-A7); when on, only for cleared
          methods.
        </p>
        <p>
          Vendor support sessions use this same matrix: a read-only grant acts as Read-only, an
          admin grant as Admin.
        </p>
      </div>
    </div>
  );
}

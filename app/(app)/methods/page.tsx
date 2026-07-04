import Link from "next/link";
import { methodApi } from "@/lib/methods";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resolveMethodActor } from "./actions";

export const metadata = { title: "Methods — LIMS" };

// Methods list (US-B1 AC 1). Top-level nav section per US-A3 AC 2; all org
// roles may view, editing is Admin / Lab manager only.
export default async function MethodsPage() {
  const actor = await resolveMethodActor();
  const methods = await methodApi.listMethods(actor);
  const canCreate = actor.role === "admin" || actor.role === "lab-manager";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Methods</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Methods</h1>
        {canCreate && (
          <Button size="sm" render={<Link href="/methods/new" />}>
            + New method
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Lab</TableHead>
              <TableHead className="text-right">Steps</TableHead>
              <TableHead className="text-right">Analytes</TableHead>
              <TableHead>Accredited</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Version</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {methods.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">
                  <Link href={`/methods/${m.id}`} className="underline-offset-4 hover:underline">
                    {m.name}
                  </Link>
                  {!m.hasTemplate && (
                    <Badge variant="secondary" className="ml-2">
                      no template
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">{m.code}</TableCell>
                <TableCell>{m.labName}</TableCell>
                <TableCell className="text-right tabular-nums">{m.stepCount}</TableCell>
                <TableCell className="text-right tabular-nums">{m.analyteCount}</TableCell>
                <TableCell>{m.accredited ? "✓" : "–"}</TableCell>
                <TableCell>
                  {m.status === "active" ? (
                    <Badge variant="outline">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  v{m.version}
                  {m.usedByBatches && (
                    <span className="ml-2 text-xs text-muted-foreground">in use</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {methods.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No methods in your lab(s) yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

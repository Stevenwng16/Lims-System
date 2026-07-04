"use client";

import { useRouter } from "next/navigation";
import type { BatchListRow } from "@/lib/batches";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function BatchStatusBadge({ status }: { status: BatchListRow["status"] }) {
  if (status === "open") {
    return (
      <Badge className="border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400">Open</Badge>
    );
  }
  if (status === "awaiting-review") {
    return (
      <Badge className="border-transparent bg-violet-500/15 text-violet-700 dark:text-violet-400">
        Awaiting review
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
        Completed
      </Badge>
    );
  }
  return <Badge variant="secondary">Voided</Badge>;
}

export function BatchList({ rows }: { rows: BatchListRow[] }) {
  const router = useRouter();
  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Position</TableHead>
              <TableHead className="text-right">Positions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => router.push(`/batches/${row.id}`)}
                className="cursor-pointer"
              >
                <TableCell className="font-mono text-sm font-medium">{row.id}</TableCell>
                <TableCell>
                  {row.methodLabel}{" "}
                  <span className="text-xs text-muted-foreground">v{row.methodVersion}</span>
                </TableCell>
                <TableCell className="text-sm">{row.status === "open" ? row.statusLabel : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.sampleCount + row.qcPositions}/{row.maxPositions}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({row.sampleCount} + {row.qcPositions} QC)
                  </span>
                </TableCell>
                <TableCell>
                  <BatchStatusBadge status={row.status} />
                </TableCell>
                <TableCell className="text-sm">{row.deadline ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.createdAt.slice(0, 10)}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No batches in this lab yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        A batch is permanently pinned to the method version it was created with; composition can
        only change while it has never left its first step and no work was recorded (US-D1).
      </p>
    </>
  );
}

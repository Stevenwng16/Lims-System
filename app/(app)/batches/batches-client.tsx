"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { BatchListRow } from "@/lib/batches";
import { claimBatchAction, type BatchFormState } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const initialState: BatchFormState = {};

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

// US-D2 AC 6: claim from the pool, right on the row.
function ClaimButton({ batchId }: { batchId: string }) {
  const [state, submit, pending] = useActionState(claimBatchAction, initialState);
  return (
    <form action={submit} onClick={(e) => e.stopPropagation()} className="inline">
      <input type="hidden" name="batchId" value={batchId} />
      <Button type="submit" size="xs" variant="outline" disabled={pending}>
        {pending ? "…" : "Claim"}
      </Button>
      {state.error && <p className="mt-1 max-w-40 text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

const ALL = "all";
type StatusFilter = "all" | "open" | "awaiting-review" | "completed" | "voided";

export function BatchQueue({
  rows,
  stepOptions,
}: {
  rows: BatchListRow[];
  stepOptions: string[];
}) {
  const router = useRouter();
  const [stepFilter, setStepFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL);
  const [methodFilter, setMethodFilter] = useState(ALL);
  const [assigneeFilter, setAssigneeFilter] = useState(ALL); // all | mine | unassigned | <email>
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [showFinished, setShowFinished] = useState(false);

  const active = (r: BatchListRow) => r.status === "open" || r.status === "awaiting-review";
  // AC 5: the lab's pulse — computed from the same server-scoped rows.
  const counts = {
    open: rows.filter((r) => r.status === "open").length,
    review: rows.filter((r) => r.status === "awaiting-review").length,
    overdue: rows.filter((r) => r.overdue).length,
    unassigned: rows.filter((r) => active(r) && r.assignee === null).length,
  };

  const methodOptions = [...new Map(rows.map((r) => [r.methodId, r.methodLabel])).entries()];
  const assigneeOptions = [
    ...new Map(
      rows.filter((r) => r.assignee).map((r) => [r.assignee as string, r.assigneeName ?? ""]),
    ).entries(),
  ];

  const visible = rows.filter((r) => {
    // AC 3: finished batches hidden unless toggled — or explicitly filtered
    // for (the US-C2 override pattern).
    const finished = r.status === "completed" || r.status === "voided";
    if (finished && !showFinished && statusFilter !== r.status) return false;
    if (statusFilter !== ALL && r.status !== statusFilter) return false;
    if (stepFilter !== ALL && !(r.status === "open" && r.stepName === stepFilter)) return false;
    if (methodFilter !== ALL && r.methodId !== methodFilter) return false;
    if (assigneeFilter === "mine" && !r.mine) return false;
    if (assigneeFilter === "unassigned" && !(active(r) && r.assignee === null)) return false;
    if (
      assigneeFilter !== ALL &&
      assigneeFilter !== "mine" &&
      assigneeFilter !== "unassigned" &&
      r.assignee !== assigneeFilter
    ) {
      return false;
    }
    if (overdueOnly && !r.overdue) return false;
    const q = query.trim().toLowerCase();
    if (q && !r.id.toLowerCase().includes(q)) return false;
    return true;
  });

  const strip = (label: string, count: number, isActive: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-sm hover:bg-muted ${isActive ? "bg-muted font-semibold" : ""}`}
    >
      {label} <span className="tabular-nums">{count}</span>
    </button>
  );

  return (
    <>
      {/* AC 5: summary strip, each count clickable as a filter. */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card px-2 py-1.5">
        {strip("Open", counts.open, statusFilter === "open" && !overdueOnly, () => {
          setStatusFilter((s) => (s === "open" ? ALL : "open"));
          setOverdueOnly(false);
        })}
        <span className="text-muted-foreground">·</span>
        {strip("Awaiting review", counts.review, statusFilter === "awaiting-review", () => {
          setStatusFilter((s) => (s === "awaiting-review" ? ALL : "awaiting-review"));
          setOverdueOnly(false);
        })}
        <span className="text-muted-foreground">·</span>
        {strip("⚠ Overdue", counts.overdue, overdueOnly, () => setOverdueOnly((o) => !o))}
        <span className="text-muted-foreground">·</span>
        {strip("Unassigned", counts.unassigned, assigneeFilter === "unassigned", () =>
          setAssigneeFilter((a) => (a === "unassigned" ? ALL : "unassigned")),
        )}
      </div>

      {/* AC 4: combining filters. */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={stepFilter} onValueChange={(v) => v && setStepFilter(v)}>
          <SelectTrigger size="sm" className="w-40" aria-label="Filter by step">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All steps</SelectItem>
            {stepOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v as StatusFilter)}>
          <SelectTrigger size="sm" className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="open">At a step</SelectItem>
            <SelectItem value="awaiting-review">Awaiting review</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
          </SelectContent>
        </Select>
        <Select value={methodFilter} onValueChange={(v) => v && setMethodFilter(v)}>
          <SelectTrigger size="sm" className="w-56" aria-label="Filter by method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All methods</SelectItem>
            {methodOptions.map(([id, label]) => (
              <SelectItem key={id} value={id}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assigneeFilter} onValueChange={(v) => v && setAssigneeFilter(v)}>
          <SelectTrigger size="sm" className="w-44" aria-label="Filter by assignee">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All assignees</SelectItem>
            <SelectItem value="mine">Mine</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {assigneeOptions.map(([email, name]) => (
              <SelectItem key={email} value={email}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={assigneeFilter === "mine" ? "default" : "outline"}
          onClick={() => setAssigneeFilter((a) => (a === "mine" ? ALL : "mine"))}
        >
          Mine
        </Button>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search batch number…"
          className="w-44"
          aria-label="Search batch number"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch</TableHead>
              <TableHead>Method (v)</TableHead>
              <TableHead>Step / status</TableHead>
              <TableHead className="text-right">Pos.</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Due</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => router.push(`/batches/${row.id}`)}
                className="cursor-pointer"
              >
                <TableCell className="font-mono text-sm font-medium">
                  {row.id}
                  {/* AC 2: a decoupled flag, never a status. */}
                  {row.overdue && (
                    <span className="ml-1 text-amber-700 dark:text-amber-400" title="Deadline passed">
                      ⚠
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {row.methodLabel} <span className="text-xs text-muted-foreground">v{row.methodVersion}</span>
                </TableCell>
                <TableCell className="text-sm">
                  {row.status === "open" ? (
                    row.statusLabel.replace(/^At step /, "")
                  ) : (
                    <BatchStatusBadge status={row.status} />
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.sampleCount + row.qcPositions}/{row.maxPositions}
                </TableCell>
                <TableCell className="text-sm">
                  {row.assigneeName ?? <span className="text-muted-foreground">—</span>}
                  {row.mine && (
                    <Badge variant="outline" className="ml-1">
                      me
                    </Badge>
                  )}
                </TableCell>
                <TableCell className={`text-sm ${row.overdue ? "font-medium text-amber-700 dark:text-amber-400" : ""}`}>
                  {row.deadline ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  {row.canClaim && <ClaimButton batchId={row.id} />}
                </TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {rows.length === 0 ? "No batches in this lab yet." : "No batches match the current filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={showFinished} onCheckedChange={(c) => setShowFinished(c === true)} />
          Show completed &amp; voided
        </label>
        <p className="text-xs text-muted-foreground">
          Assignment coordinates, it never gates — a cleared colleague can always act (US-D2).
        </p>
      </div>
    </>
  );
}
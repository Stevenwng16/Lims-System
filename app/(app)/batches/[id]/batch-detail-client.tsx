"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useActionState } from "react";
import type { BatchDetail } from "@/lib/batches";
import { updateCompositionAction, type BatchFormState } from "../actions";
import { BatchStatusBadge } from "../batches-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const initialState: BatchFormState = {};

function fmt(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

// Open-window composition editor (AC 10): current members + addable samples +
// QC quantities, everything re-validated server-side against the PINNED
// method version.
function EditCompositionDialog({
  detail,
  jobLabel,
  onDone,
}: {
  detail: BatchDetail;
  jobLabel: string;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(updateCompositionAction, initialState);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(detail.record.sampleIds),
  );
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [qc, setQc] = useState<Map<string, number>>(
    () => new Map(detail.record.qc.map((e) => [e.materialId, e.quantity])),
  );
  const [confirmFor, setConfirmFor] = useState<string | null>(null);

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  type Row = { id: string; label: string; requested: boolean; member: boolean };
  const rows: Row[] = [
    ...detail.samples.map((s) => ({
      id: s.id,
      label: `${s.typeName} — ${s.customer} — ${s.description}`,
      requested: s.requested,
      member: true,
    })),
    ...detail.addableSamples.map((s) => ({
      id: s.id,
      label: `${s.typeName} — ${s.customer} — ${s.description}`,
      requested: s.requested,
      member: false,
    })),
  ];

  const toggle = (row: Row, on: boolean) => {
    if (on && !row.requested && !row.member && !confirmed.has(row.id)) {
      setConfirmFor(row.id);
      return;
    }
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(row.id);
      else next.delete(row.id);
      return next;
    });
  };

  const qcPositions = [...qc.values()].reduce((sum, n) => sum + n, 0);
  const positions = selected.size + qcPositions;

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit composition — {detail.record.id}</DialogTitle>
          <DialogDescription>
            Possible only while the batch has never left its first step and no work is recorded.
            Removing a sample returns it to Received for this method; every change is recorded and
            the working copy is regenerated.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="batchId" value={detail.record.id} />
          <input type="hidden" name="sampleIdsJson" value={JSON.stringify([...selected])} />
          <input type="hidden" name="confirmJson" value={JSON.stringify([...confirmed])} />
          <input
            type="hidden"
            name="qcJson"
            value={JSON.stringify([...qc].map(([materialId, quantity]) => ({ materialId, quantity })))}
          />

          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Samples ({selected.size})</legend>
            {rows.map((row) => (
              <label key={row.id} className="flex items-center gap-3 rounded px-1 py-1 text-sm hover:bg-muted/50">
                <Checkbox
                  checked={selected.has(row.id)}
                  onCheckedChange={(c) => toggle(row, c === true)}
                />
                <span className="w-44 shrink-0 font-mono text-xs">{row.id}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.label}</span>
                {!row.requested && <Badge variant="secondary">not requested</Badge>}
              </label>
            ))}
          </fieldset>

          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">
              QC ({qc.size} · {qcPositions} pos.) — positions {positions}/{detail.maxPositions}
            </legend>
            {detail.qcOptions.map((o) => (
              <div key={o.materialId} className="flex items-center gap-3 rounded px-1 py-1 text-sm">
                <Checkbox
                  checked={qc.has(o.materialId)}
                  onCheckedChange={(c) =>
                    setQc((m) => {
                      const next = new Map(m);
                      if (c === true) next.set(o.materialId, next.get(o.materialId) ?? 1);
                      else next.delete(o.materialId);
                      return next;
                    })
                  }
                  aria-label={`Include ${o.code}`}
                />
                <span className="w-16 shrink-0 font-mono text-xs">{o.code}</span>
                <span className="min-w-0 flex-1 truncate">
                  {o.name} <span className="text-muted-foreground">({o.typeLabel})</span>
                </span>
                {qc.has(o.materialId) && (
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={qc.get(o.materialId)}
                    onChange={(e) =>
                      setQc((m) => {
                        const next = new Map(m);
                        const n = Number(e.target.value);
                        next.set(o.materialId, Number.isInteger(n) && n >= 1 && n <= 99 ? n : 1);
                        return next;
                      })
                    }
                    className="h-7 w-16"
                    aria-label={`${o.code} quantity`}
                  />
                )}
              </div>
            ))}
          </fieldset>

          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending || selected.size === 0}>
            {pending ? "Saving…" : "Save composition"}
          </Button>
        </form>

        {confirmFor && (
          <Dialog open onOpenChange={(o) => !o && setConfirmFor(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a method to {confirmFor}?</DialogTitle>
                <DialogDescription>
                  This sample does not request this method. Adding it will add the method to the
                  sample&apos;s requested methods (recorded), so the {jobLabel.toLowerCase()}&apos;s
                  completeness stays meaningful.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmFor(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setConfirmed((c) => new Set(c).add(confirmFor));
                    setSelected((s) => new Set(s).add(confirmFor));
                    setConfirmFor(null);
                  }}
                >
                  Add sample and record the method
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function BatchDetailClient({
  detail,
  canEdit,
  downloadable,
  jobLabel,
}: {
  detail: BatchDetail;
  canEdit: boolean;
  downloadable: boolean;
  jobLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const batch = detail.record;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-semibold text-foreground">{batch.id}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.methodLabel} <strong>v{batch.methodVersion}</strong> (pinned) ·{" "}
            {detail.labName} lab · created {fmt(batch.createdAt)} by {batch.createdBy}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <BatchStatusBadge status={batch.status} />
            {batch.status === "open" && <Badge variant="outline">Step: {detail.stepName}</Badge>}
            <Badge variant="outline">
              {detail.positionsUsed}/{detail.maxPositions} positions
            </Badge>
          </div>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit composition
          </Button>
        )}
      </div>

      {!detail.compositionOpen && batch.status === "open" && (
        <p className="text-xs text-muted-foreground">
          Composition is locked (work has been recorded). A sample that cannot continue is closed
          out with a no-result and reason (US-D4); a wrongly composed batch is voided (US-D3) — a
          set-back never reopens composition.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Samples ({detail.samples.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sample</TableHead>
                <TableHead>{jobLabel}</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Customer / description</TableHead>
                <TableHead>Acceptance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.samples.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm">{s.id}</TableCell>
                  <TableCell>
                    {s.jobId ? (
                      <Link href={`/jobs/${s.jobId}`} className="text-primary underline-offset-4 hover:underline">
                        {s.jobId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{s.typeName}</TableCell>
                  <TableCell className="max-w-64 truncate text-sm text-muted-foreground">
                    {s.customer} — {s.description}
                  </TableCell>
                  <TableCell className="text-sm">
                    {s.acceptance === "accepted-with-reservation" ? (
                      <span className="text-amber-700 dark:text-amber-400">⚠ with reservation</span>
                    ) : (
                      "Accepted"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>QC ({detail.qc.length} · {detail.qc.reduce((s, e) => s + e.quantity, 0)} positions)</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.qc.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              ⚠ This batch carries no QC (allowed, but flagged — required QC per method arrives
              with US-B4).
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Lot</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.qc.map((e) => (
                  <TableRow key={e.materialId}>
                    <TableCell className="font-mono text-sm">{e.code}</TableCell>
                    <TableCell>
                      {e.name} <span className="text-xs text-muted-foreground">({e.typeLabel})</span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{e.lotNumber || "—"}</TableCell>
                    <TableCell className="text-sm">{e.expiryDate || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">×{e.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Each QC entry is the material at its specific lot; instrument-import rows carrying the
            material code match the entry (US-D5).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Working copy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {batch.workingCopy ? (
            <>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {batch.workingCopy.fileName} · sha256 {batch.workingCopy.sha256.slice(0, 16)}… ·
                generated {fmt(batch.workingCopy.generatedAt)}
              </p>
              {downloadable ? (
                <Button size="sm" variant="outline" render={<a href={`/batches/${batch.id}/working-copy`} />}>
                  Download
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  (Seed demo — the file bytes are not retained; newly created batches are
                  downloadable.)
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No working copy generated.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Generated from the pinned template version with the batch sheet (number, method +
            version, creation date, ordered composition); the checksum is recorded at generation.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History (append-only)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>What</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...batch.events]
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell className="font-mono text-xs">{fmt(ev.at)}</TableCell>
                    <TableCell className="text-sm">{ev.by}</TableCell>
                    <TableCell className="text-sm">{ev.summary}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            Reagent lots: — (the batch ↔ reagent-lot relation is reserved; the administration is a
            post-MVP story). Steps, data entry and void arrive with US-D3/D4.
          </p>
        </CardContent>
      </Card>

      {editing && (
        <EditCompositionDialog detail={detail} jobLabel={jobLabel} onDone={() => setEditing(false)} />
      )}
    </>
  );
}

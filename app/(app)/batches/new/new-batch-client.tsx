"use client";

import { useState } from "react";
import { useActionState } from "react";
import type { MethodBatchOptions } from "@/lib/batches";
import { createBatchAction, type BatchFormState } from "../actions";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: BatchFormState = {};

export function NewBatchForm({
  labId,
  methods,
  jobLabel,
}: {
  labId: string;
  methods: MethodBatchOptions[];
  jobLabel: string;
}) {
  const [state, submit, pending] = useActionState(createBatchAction, initialState);
  const [methodId, setMethodId] = useState(methods[0]?.methodId ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [qc, setQc] = useState<Map<string, number>>(new Map());
  const [requestedOnly, setRequestedOnly] = useState(true);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);

  const method = methods.find((m) => m.methodId === methodId) ?? null;

  // Switching methods resets the composition — eligibility is per method.
  const pickMethod = (next: string) => {
    setMethodId(next);
    setSelected(new Set());
    setConfirmed(new Set());
    setQc(new Map());
    setConfirmFor(null);
  };

  const toggleSample = (sampleId: string, on: boolean, requested: boolean) => {
    if (on && !requested && !confirmed.has(sampleId)) {
      setConfirmFor(sampleId); // AC 5: explicit confirmation first
      return;
    }
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(sampleId);
      else next.delete(sampleId);
      return next;
    });
    if (!on) {
      setConfirmed((c) => {
        const next = new Set(c);
        next.delete(sampleId);
        return next;
      });
    }
  };

  const toggleQc = (materialId: string, on: boolean) =>
    setQc((m) => {
      const next = new Map(m);
      if (on) next.set(materialId, 1);
      else next.delete(materialId);
      return next;
    });

  const setQuantity = (materialId: string, raw: string) =>
    setQc((m) => {
      const next = new Map(m);
      const n = Number(raw);
      next.set(materialId, Number.isInteger(n) && n >= 1 && n <= 99 ? n : 1);
      return next;
    });

  const qcPositions = [...qc.values()].reduce((sum, n) => sum + n, 0);
  const positions = selected.size + qcPositions;
  const overCapacity = method !== null && positions > method.maxPositions;

  const visibleSamples = (method?.eligibleSamples ?? []).filter(
    (s) => !requestedOnly || s.requested || selected.has(s.id),
  );
  const confirmSample = method?.eligibleSamples.find((s) => s.id === confirmFor) ?? null;

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="labId" value={labId} />
      <input type="hidden" name="methodId" value={methodId} />
      <input type="hidden" name="sampleIdsJson" value={JSON.stringify([...selected])} />
      <input type="hidden" name="confirmJson" value={JSON.stringify([...confirmed])} />
      <input
        type="hidden"
        name="qcJson"
        value={JSON.stringify([...qc].map(([materialId, quantity]) => ({ materialId, quantity })))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Method</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {methods.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active methods in this lab.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Select value={methodId} onValueChange={(v) => v && pickMethod(v)}>
                <SelectTrigger className="w-96" aria-label="Method">
                  <SelectValue placeholder="Choose a method" />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((m) => (
                    <SelectItem key={m.methodId} value={m.methodId}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {method && (
                <span className="text-sm text-muted-foreground">
                  {method.maxPositions} positions · starts at “{method.firstStepName}”
                </span>
              )}
            </div>
          )}
          {method && !method.hasTemplate && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              The pinned method version has no template — the working copy will contain the batch
              sheet only.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Version {method?.version ?? "—"} is pinned at creation — publishing a newer method
            version later changes nothing on this batch.
          </p>
        </CardContent>
      </Card>

      {method && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Samples ({selected.size})</CardTitle>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={requestedOnly}
                onCheckedChange={(c) => setRequestedOnly(c === true)}
              />
              Requested for this method only
            </label>
          </CardHeader>
          <CardContent className="space-y-1">
            {visibleSamples.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No eligible samples{requestedOnly ? " requesting this method" : ""} — samples must
                be accepted, not voided, and not already in an open batch of this method.
              </p>
            )}
            {visibleSamples.map((s) => (
              <label key={s.id} className="flex items-center gap-3 rounded px-1 py-1 text-sm hover:bg-muted/50">
                <Checkbox
                  checked={selected.has(s.id)}
                  onCheckedChange={(c) => toggleSample(s.id, c === true, s.requested)}
                />
                <span className="w-44 shrink-0 font-mono text-xs">{s.id}</span>
                <span className="w-20 shrink-0">{s.typeName}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {s.customer} — {s.description}
                </span>
                {s.acceptance === "accepted-with-reservation" && (
                  <span title="Accepted with reservation" className="text-amber-700 dark:text-amber-400">
                    ⚠ reservation
                  </span>
                )}
                {!s.requested && <Badge variant="secondary">not requested</Badge>}
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      {method && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>
              QC ({qc.size} · {qcPositions} pos.)
            </CardTitle>
            <span
              className={`text-sm tabular-nums ${overCapacity ? "font-semibold text-destructive" : "text-muted-foreground"}`}
            >
              Positions used: {positions}/{method.maxPositions} ({selected.size} samples +{" "}
              {qcPositions} QC)
            </span>
          </CardHeader>
          <CardContent className="space-y-1">
            {method.qcOptions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No QC materials cover this method&apos;s analytes (active, unexpired, same lab).
              </p>
            )}
            {method.qcOptions.map((o) => (
              <div key={o.materialId} className="flex items-center gap-3 rounded px-1 py-1 text-sm">
                <Checkbox
                  checked={qc.has(o.materialId)}
                  onCheckedChange={(c) => toggleQc(o.materialId, c === true)}
                  aria-label={`Add ${o.code}`}
                />
                <span className="w-16 shrink-0 font-mono text-xs">{o.code}</span>
                <span className="min-w-0 flex-1 truncate">
                  {o.name} <span className="text-muted-foreground">({o.typeLabel})</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {o.lotNumber ? `lot ${o.lotNumber}` : ""}
                  {o.expiryDate ? ` · exp ${o.expiryDate}` : ""}
                </span>
                {qc.has(o.materialId) && (
                  <span className="flex shrink-0 items-center gap-1">
                    <Label htmlFor={`qty-${o.materialId}`} className="text-xs">
                      ×
                    </Label>
                    <Input
                      id={`qty-${o.materialId}`}
                      type="number"
                      min={1}
                      max={99}
                      value={qc.get(o.materialId)}
                      onChange={(e) => setQuantity(o.materialId, e.target.value)}
                      className="h-7 w-16"
                    />
                  </span>
                )}
              </div>
            ))}
            {qc.size === 0 && method.qcOptions.length > 0 && (
              <p className="pt-1 text-xs text-amber-700 dark:text-amber-400">
                ⚠ No QC selected — the batch can be created, but a run without QC proves nothing
                about result validity (required QC per method arrives with US-B4).
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Working copy: generated on create from the pinned template version, checksum recorded;
          the batch sheet lists the exact composition.
        </p>
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending || !method || selected.size === 0 || overCapacity}>
          {pending ? "Creating…" : "Create batch"}
        </Button>
      </div>

      {confirmSample && (
        <Dialog open onOpenChange={(o) => !o && setConfirmFor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a method to {confirmSample.id}?</DialogTitle>
              <DialogDescription>
                This sample does not request this method. Adding it to the batch will add the
                method to the sample&apos;s requested methods (recorded), so the{" "}
                {jobLabel.toLowerCase()}&apos;s completeness stays meaningful.
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
                  setConfirmed((c) => new Set(c).add(confirmSample.id));
                  setSelected((s) => new Set(s).add(confirmSample.id));
                  setConfirmFor(null);
                }}
              >
                Add sample and record the method
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </form>
  );
}

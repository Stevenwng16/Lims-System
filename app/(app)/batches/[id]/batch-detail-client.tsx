"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useActionState } from "react";
import type { BatchDetail, ResultsGrid, ReviewView, StepRailEntry } from "@/lib/batches";
import { ResultsGridSection } from "./results-grid";
import { ReviewPanel } from "./review-panel";
import type { ImportConfigOption } from "./import-dialog";
import {
  assignBatchAction,
  claimBatchAction,
  completeStepAction,
  releaseClaimAction,
  setBackAction,
  updateCompositionAction,
  uploadWorksheetAction,
  voidBatchAction,
  type BatchFormState,
} from "../actions";
import { BatchStatusBadge } from "../batches-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const initialState: BatchFormState = {};

const PROGRESS_LABELS: Record<string, string> = {
  received: "Received",
  "in-batch": "In batch",
  "in-progress": "In progress",
  completed: "Completed",
};

function fmt(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

// ---- Steps tab dialogs -----------------------------------------------------

// AC 4: complete the current step — one specific item per required type.
// Blocked items are never offered (listed with why); Due soon items carry a
// visible warning. The server re-validates everything at submit.
function CompleteStepDialog({
  batchId,
  step,
  assignedWarning,
  onDone,
}: {
  batchId: string;
  step: StepRailEntry;
  assignedWarning: string | null; // US-D2 AC 7: warn, never block
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(completeStepAction, initialState);
  const [choices, setChoices] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  const missingType = step.requiredTypes.some((rt) => !choices.get(rt.typeId));
  const deadType = step.requiredTypes.some((rt) => rt.options.length === 0);
  const equipmentJson = JSON.stringify(
    [...choices].map(([typeId, equipmentId]) => ({ typeId, equipmentId })),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Complete step {step.index + 1} — {step.name}
          </DialogTitle>
          <DialogDescription>
            The completion record stores who, when{step.requiredTypes.length > 0 && " and the specific equipment used"} —
            it becomes part of the batch&apos;s proof of how the work was performed.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="expectedStepIndex" value={step.index} />
          <input type="hidden" name="equipmentJson" value={equipmentJson} />

          {assignedWarning && (
            <p className="text-sm text-amber-700 dark:text-amber-400">⚠ {assignedWarning}</p>
          )}

          {step.requiredTypes.length > 0 && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Required equipment</legend>
              {step.requiredTypes.map((rt) => {
                const chosen = rt.options.find((o) => o.equipmentId === choices.get(rt.typeId));
                return (
                  <div key={rt.typeId} className="space-y-1">
                    <Label>{rt.typeName}</Label>
                    {rt.options.length === 0 ? (
                      <p className="text-sm font-medium text-destructive">
                        No usable {rt.typeName} in this lab — the step cannot be completed until
                        one is fit for use.
                      </p>
                    ) : (
                      <Select
                        value={choices.get(rt.typeId) ?? ""}
                        onValueChange={(v) =>
                          v && setChoices((m) => new Map(m).set(rt.typeId, v))
                        }
                      >
                        <SelectTrigger className="w-80" aria-label={`Select ${rt.typeName}`}>
                          <SelectValue placeholder={`Choose the ${rt.typeName.toLowerCase()} used`} />
                        </SelectTrigger>
                        <SelectContent>
                          {rt.options.map((o) => (
                            <SelectItem key={o.equipmentId} value={o.equipmentId}>
                              {o.name} ({o.assetId}){o.state === "due-soon" ? " — ⚠ due soon" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {chosen?.warning && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">⚠ {chosen.warning}</p>
                    )}
                    {rt.blocked.map((b) => (
                      <p key={b.assetId} className="text-xs text-muted-foreground">
                        {b.name} ({b.assetId}) blocked — {b.reasons[0]}
                      </p>
                    ))}
                  </div>
                );
              })}
            </fieldset>
          )}

          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending || missingType || deadType}>
            {pending ? "Saving…" : "Confirm completion"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// AC 6: set back for rework — Admin/Lab manager, mandatory reason. Redoing a
// step creates a NEW completion record; composition stays locked forever.
function SetBackDialog({
  detail,
  onDone,
}: {
  detail: BatchDetail;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(setBackAction, initialState);
  const fromReview = detail.record.status === "awaiting-review";
  const targets = detail.steps.filter((s) =>
    fromReview ? true : s.index < detail.record.currentStepIndex,
  );
  const [toIndex, setToIndex] = useState(String(targets[targets.length - 1]?.index ?? 0));

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set back — {detail.record.id}</DialogTitle>
          <DialogDescription>
            A set-back returns the batch for rework: redoing a step creates a new completion
            record (the original stays in History) and composition never reopens.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="batchId" value={detail.record.id} />
          <input type="hidden" name="toStepIndex" value={toIndex} />
          <div className="space-y-2">
            <Label>Back to step</Label>
            <Select value={toIndex} onValueChange={(v) => v && setToIndex(v)}>
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targets.map((s) => (
                  <SelectItem key={s.index} value={String(s.index)}>
                    {s.index + 1}. {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sb-reason">Reason (required)</Label>
            <Textarea id="sb-reason" name="reason" required />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending || targets.length === 0}>
            {pending ? "Saving…" : "Set batch back"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// AC 7: void with reason — never deleted; samples return to Received.
function VoidBatchDialog({ detail, onDone }: { detail: BatchDetail; onDone: () => void }) {
  const [state, submit, pending] = useActionState(voidBatchAction, initialState);

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void batch — {detail.record.id}</DialogTitle>
          <DialogDescription>
            The batch stays viewable with its files and history; its samples return to Received
            and can be re-batched. Results already recorded can never become valid.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="batchId" value={detail.record.id} />
          <div className="space-y-2">
            <Label htmlFor="void-reason">Reason (required)</Label>
            <Textarea id="void-reason" name="reason" required />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" variant="destructive" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Void batch"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- composition editor (US-D1 AC 10, unchanged behaviour) -----------------

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
  const [selected, setSelected] = useState<Set<string>>(() => new Set(detail.record.sampleIds));
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [qc, setQc] = useState<Map<string, number>>(
    () => new Map(detail.record.qc.map((e) => [e.materialId, e.quantity])),
  );
  const [confirmFor, setConfirmFor] = useState<string | null>(null);

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  type Row = { id: string; label: string; requested: boolean; member: boolean; voided: boolean };
  const rows: Row[] = [
    ...detail.samples.map((s) => ({
      id: s.id,
      label: `${s.typeName} — ${s.customer} — ${s.description}`,
      requested: s.requested,
      member: true,
      voided: s.voided, // voided member: visible so it can be unchecked
    })),
    ...detail.addableSamples.map((s) => ({
      id: s.id,
      label: `${s.typeName} — ${s.customer} — ${s.description}`,
      requested: s.requested,
      member: false,
      voided: false, // eligibility already excludes voided samples
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
                <Checkbox checked={selected.has(row.id)} onCheckedChange={(c) => toggle(row, c === true)} />
                <span className="w-44 shrink-0 font-mono text-xs">{row.id}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.label}</span>
                {!row.requested && <Badge variant="secondary">not requested</Badge>}
                {/* the server refuses to KEEP a voided member — name the fix */}
                {row.voided && <Badge variant="destructive">voided — uncheck to remove</Badge>}
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
                {/* expired/deactivated since creation: keep, reduce or remove only */}
                {o.heldOnly && <Badge variant="secondary">no longer offered</Badge>}
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

// ---- Files tab: worksheet upload (US-D4 AC 9 slice, gates US-D3 AC 5) ------

function WorksheetUpload({ batchId }: { batchId: string }) {
  const [state, submit, pending] = useActionState(uploadWorksheetAction, initialState);
  return (
    <form action={submit} className="flex items-end gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <div className="flex-1 space-y-1">
        <Label htmlFor="ws-file">Upload completed worksheet</Label>
        <Input id="ws-file" name="file" type="file" accept=".xlsx,.xls,.csv,.pdf" />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Uploading…" : "Upload"}
      </Button>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

// ---- the page ---------------------------------------------------------------

// US-D2 AC 8: manager assignment — only workable users are offered; the
// server re-validates the target's rights on submit.
function AssignDialog({
  detail,
  assignableUsers,
  onDone,
}: {
  detail: BatchDetail;
  assignableUsers: { email: string; name: string }[];
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(assignBatchAction, initialState);
  const [assignee, setAssignee] = useState(detail.assignee ?? "");

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign — {detail.record.id}</DialogTitle>
          <DialogDescription>
            The assignee signals who is on it; a cleared colleague can still act (open pool).
            Only users allowed to work on this batch can be assigned.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="batchId" value={detail.record.id} />
          <input type="hidden" name="assignee" value={assignee} />
          <div className="space-y-2">
            <Label>Assignee</Label>
            <Select value={assignee || "none"} onValueChange={(v) => v && setAssignee(v === "none" ? "" : v)}>
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned (open pool) —</SelectItem>
                {assignableUsers.map((u) => (
                  <SelectItem key={u.email} value={u.email}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save assignment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClaimReleaseButtons({
  detail,
  actorEmail,
  canWork,
}: {
  detail: BatchDetail;
  actorEmail: string;
  canWork: boolean;
}) {
  const [claimState, claimSubmit, claimPending] = useActionState(claimBatchAction, initialState);
  const [releaseState, releaseSubmit, releasePending] = useActionState(releaseClaimAction, initialState);
  const active = detail.record.status === "open" || detail.record.status === "awaiting-review";
  if (!active) return null;

  return (
    <span className="inline-flex items-center gap-2">
      {detail.assignee === null && canWork && (
        <form action={claimSubmit} className="inline">
          <input type="hidden" name="batchId" value={detail.record.id} />
          <Button type="submit" size="xs" variant="outline" disabled={claimPending}>
            {claimPending ? "…" : "Claim"}
          </Button>
        </form>
      )}
      {detail.assignee === actorEmail && (
        <form action={releaseSubmit} className="inline">
          <input type="hidden" name="batchId" value={detail.record.id} />
          <Button type="submit" size="xs" variant="ghost" disabled={releasePending}>
            {releasePending ? "…" : "Release claim"}
          </Button>
        </form>
      )}
      {(claimState.error || releaseState.error) && (
        <span className="text-xs text-destructive">{claimState.error ?? releaseState.error}</span>
      )}
    </span>
  );
}

type DialogState =
  | { kind: "complete"; step: StepRailEntry }
  | { kind: "set-back" }
  | { kind: "void" }
  | { kind: "composition" }
  | { kind: "assign" }
  | null;

export function BatchDetailClient({
  detail,
  grid,
  canEdit,
  canWork,
  canManage,
  downloadable,
  jobLabel,
  actorEmail,
  assignableUsers,
  importConfigs,
  review,
}: {
  detail: BatchDetail;
  grid: ResultsGrid | null;
  canEdit: boolean;
  canWork: boolean;
  canManage: boolean;
  downloadable: boolean;
  jobLabel: string;
  actorEmail: string;
  assignableUsers: { email: string; name: string }[];
  importConfigs: ImportConfigOption[];
  review: ReviewView | null;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);
  const batch = detail.record;
  const eventsDesc = [...detail.events].sort((a, b) => b.at.localeCompare(a.at));
  const today = new Date().toISOString().slice(0, 10);
  const deadlineNear = detail.deadline !== null && detail.deadline <= today;
  const currentStep = detail.steps.find((s) => s.state === "current") ?? null;
  // US-D2 AC 7: assigned to someone ELSE — warn, never block.
  const assignedToOther = detail.assignee !== null && detail.assignee !== actorEmail;
  const assignedWarning = assignedToOther
    ? `Assigned to ${detail.assigneeName} — assignment coordinates, it never gates. Continue?`
    : null;

  return (
    <>
      {/* Header (AC 1) */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-lg font-semibold text-foreground">{batch.id}</span>
          <span className="text-muted-foreground">·</span>
          <span>
            {detail.methodLabel} <strong>v{batch.methodVersion}</strong>{" "}
            <span className="text-xs text-muted-foreground">(pinned)</span>
          </span>
          <span className="text-muted-foreground">·</span>
          <BatchStatusBadge status={batch.status} />
          <span className="text-sm">{detail.statusLabel}</span>
          {batch.results.some((r) => r.amendmentCheckRequired) && (
            <Badge variant="destructive" title="A result was replaced after completion (§7.8.8)">
              ⚠ amendment check required
            </Badge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            {detail.samples.length} samples + {detail.positionsUsed - detail.samples.length} QC ·{" "}
            {detail.positionsUsed}/{detail.maxPositions} positions
          </span>
          <span>·</span>
          <span>
            created {fmt(batch.createdAt)} by {batch.createdBy}
          </span>
          <span>·</span>
          <span className={deadlineNear ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
            {detail.deadline ? `due ${detail.deadline} ${deadlineNear ? "⚠" : ""}` : "no deadline"}
          </span>
          <span>·</span>
          <span>
            Assignee: {detail.assigneeName ?? "— (open pool)"}
            {detail.assignee === actorEmail && " (you)"}
          </span>
          <ClaimReleaseButtons detail={detail} actorEmail={actorEmail} canWork={canWork} />
          {canManage && (batch.status === "open" || batch.status === "awaiting-review") && (
            <Button size="xs" variant="ghost" onClick={() => setDialog({ kind: "assign" })}>
              Assign…
            </Button>
          )}
          {batch.workingCopy && downloadable && (
            <>
              <span>·</span>
              <a href={`/batches/${batch.id}/working-copy`} className="text-primary underline-offset-4 hover:underline">
                Working copy ⬇
              </a>
            </>
          )}
        </div>
        {batch.status === "voided" && (
          <Alert variant="destructive" className="mt-3">
            <AlertTitle>Voided batch</AlertTitle>
            <AlertDescription>
              {batch.voidReason} — the record, files and history remain; its samples returned to
              Received and can be re-batched.
            </AlertDescription>
          </Alert>
        )}
        {assignedToOther && canWork && batch.status === "open" && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            ⚠ Assigned to {detail.assigneeName} — you can still act on this batch (open pool); the
            assignment only signals who is on it.
          </p>
        )}
      </div>

      <Tabs defaultValue="steps">
        <TabsList>
          <TabsTrigger value="samples">Samples</TabsTrigger>
          <TabsTrigger value="steps">Steps</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Samples (AC 2) */}
        <TabsContent value="samples" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Samples ({detail.samples.length})</CardTitle>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "composition" })}>
                  Edit composition
                </Button>
              )}
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
                    <TableHead>State (this method)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.samples.map((s) => (
                    // A member voided from the job side renders muted with a
                    // badge — the batch page and job page must tell the same
                    // story about the same sample (review fix, pass 2).
                    <TableRow key={s.id} className={s.voided ? "opacity-60" : undefined}>
                      <TableCell className="font-mono text-sm">
                        {s.id}
                        {s.voided && (
                          <Badge variant="destructive" className="ml-2">
                            voided
                          </Badge>
                        )}
                      </TableCell>
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
                      <TableCell className="max-w-56 truncate text-sm text-muted-foreground">
                        {s.customer} — {s.description}
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.acceptance === "accepted-with-reservation" ? (
                          <span className="text-amber-700 dark:text-amber-400">⚠ with reservation</span>
                        ) : (
                          "Accepted"
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {PROGRESS_LABELS[detail.sampleProgress[s.id] ?? "received"]}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!detail.compositionOpen && batch.status === "open" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Composition is locked (work has been recorded) — a set-back never reopens it.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                QC ({detail.qc.length} · {detail.qc.reduce((s, e) => s + e.quantity, 0)} positions)
              </CardTitle>
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Steps (AC 3/4/5/6/7) */}
        <TabsContent value="steps" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Steps</CardTitle>
              <div className="flex gap-2">
                {canManage && (batch.status === "open" || batch.status === "awaiting-review") && (
                  <>
                    {(batch.status === "awaiting-review" || batch.currentStepIndex > 0) && (
                      <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "set-back" })}>
                        Set back…
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDialog({ kind: "void" })}>
                      Void batch…
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {batch.status === "awaiting-review" && (
                <Alert className="mb-3">
                  <AlertDescription>
                    All method steps are complete — the batch is <strong>awaiting review</strong>{" "}
                    (US-D6). Review is a system phase, not a configurable step.
                  </AlertDescription>
                </Alert>
              )}
              {detail.steps.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 rounded px-1 py-1.5 text-sm">
                  <span className="w-5 text-center">
                    {s.state === "completed" ? "✓" : s.state === "current" ? "►" : "○"}
                  </span>
                  <span className={s.state === "current" ? "font-semibold" : s.state === "pending" ? "text-muted-foreground" : ""}>
                    {s.index + 1}. {s.name}
                  </span>
                  {s.lastCompletion && (
                    <span className="text-xs text-muted-foreground">
                      — {s.lastCompletion.by}, {fmt(s.lastCompletion.at)}
                      {s.lastCompletion.equipment.length > 0 && ` · ${s.lastCompletion.equipment.join(", ")}`}
                    </span>
                  )}
                  {s.state === "current" && canWork && (
                    <Button size="xs" className="ml-auto" onClick={() => setDialog({ kind: "complete", step: s })}>
                      Complete step
                    </Button>
                  )}
                </div>
              ))}
              {currentStep && currentStep.requiredTypes.length > 0 && (
                <p className="pt-2 text-xs text-muted-foreground">
                  Completing “{currentStep.name}” requires selecting the{" "}
                  {currentStep.requiredTypes.map((rt) => rt.typeName).join(" and ")} used — Blocked
                  items cannot be selected (US-B3).
                </p>
              )}
              <p className="pt-1 text-xs text-muted-foreground">
                The workflow is strictly linear; a redo after a set-back creates a new completion
                record and the original stays in History.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Results: US-D4 entry grid while working; US-D6 review view after. */}
        <TabsContent value="results" className="mt-4">
          {batch.status !== "open" && review ? (
            <ReviewPanel batchId={batch.id} view={review} />
          ) : grid ? (
            <ResultsGridSection
              batchId={batch.id}
              grid={grid}
              canEnter={canWork}
              importConfigs={importConfigs}
            />
          ) : (
            <p className="text-sm text-muted-foreground">The results grid could not be loaded.</p>
          )}
        </TabsContent>

        {/* Files (AC 2 / AC 5 gate) */}
        <TabsContent value="files" className="mt-4 space-y-4">
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
                      (Seed demo — the file bytes are not retained; newly created batches are downloadable.)
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No working copy generated.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Completed worksheet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.worksheets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Not attached yet — the final step cannot be completed without it (the transition
                  to review is gated on the completed worksheet, US-D4).
                </p>
              ) : (
                <ul className="space-y-1">
                  {detail.worksheets.map((ws, i) => (
                    <li key={ws.id} className="break-all font-mono text-xs text-muted-foreground">
                      v{i + 1}{i === detail.worksheets.length - 1 ? " (current)" : ""} — {ws.fileName} ·
                      sha256 {ws.sha256.slice(0, 16)}… · {fmt(ws.uploadedAt)} by {ws.uploadedBy}
                    </li>
                  ))}
                </ul>
              )}
              {canWork && batch.status === "open" && <WorksheetUpload batchId={batch.id} />}
              <p className="text-xs text-muted-foreground">
                Replacing uploads a new version — nothing is ever overwritten.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Imports (US-D5)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {batch.imports.length === 0 ? (
                <p className="text-sm text-muted-foreground">No instrument imports yet.</p>
              ) : (
                <ul className="space-y-2">
                  {batch.imports.map((imp) => (
                    <li key={imp.id} className="text-xs">
                      <p className="break-all font-mono text-muted-foreground">
                        {imp.file.fileName} · sha256 {imp.file.sha256.slice(0, 16)}… · {fmt(imp.at)} by {imp.by}
                      </p>
                      <p className="text-muted-foreground">
                        config &quot;{imp.configName}&quot; (mapping frozen on the event) ·{" "}
                        {imp.rows.filter((r) => r.outcome === "imported").length} row(s) imported ·{" "}
                        {imp.rows.filter((r) => r.outcome === "skipped").length} skipped ·{" "}
                        {imp.rows.filter((r) => r.outcome === "rejected").length} rejected
                        {imp.supersedeReason && ` · replacements: ${imp.supersedeReason}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Each import is one self-contained event: the original file, its checksum, the
                applied mapping and every row&apos;s outcome — reproducible from the event alone.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History (AC 2/11) — renders the event list itself, never a copy. */}
        <TabsContent value="history" className="mt-4">
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
                  {eventsDesc.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="font-mono text-xs">{fmt(ev.at)}</TableCell>
                      <TableCell className="text-sm">{ev.by}</TableCell>
                      <TableCell className="text-sm">{ev.summary}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-muted-foreground">
                Reagent lots: — (relation reserved; administration is post-MVP). Results and
                review events join this trail with US-D4/D6.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {dialog?.kind === "complete" && (
        <CompleteStepDialog
          batchId={batch.id}
          step={dialog.step}
          assignedWarning={assignedWarning}
          onDone={close}
        />
      )}
      {dialog?.kind === "assign" && (
        <AssignDialog detail={detail} assignableUsers={assignableUsers} onDone={close} />
      )}
      {dialog?.kind === "set-back" && <SetBackDialog detail={detail} onDone={close} />}
      {dialog?.kind === "void" && <VoidBatchDialog detail={detail} onDone={close} />}
      {dialog?.kind === "composition" && (
        <EditCompositionDialog detail={detail} jobLabel={jobLabel} onDone={close} />
      )}
    </>
  );
}

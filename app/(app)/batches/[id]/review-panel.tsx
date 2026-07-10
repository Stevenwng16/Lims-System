"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import type { ResultTarget, ReviewView } from "@/lib/batches";
import type { MockMeasurementRecord, ResultValue } from "@/lib/mock-db";
import {
  closeGapAction,
  completeBatchAction,
  replaceResultAction,
  setValidityAction,
  validateAllAction,
  type BatchFormState,
} from "../actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";

const initialState: BatchFormState = {};

function display(value: ResultValue): string {
  switch (value.kind) {
    case "numeric":
      return value.value;
    case "censored":
      return `${value.qualifier}${value.boundary}`;
    case "qualifier":
      return value.label;
    case "text":
      return value.text;
    case "no-result":
      return "no result";
  }
}

function fmt(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

const key = (targetType: string, targetId: string, analyteId: string) =>
  `${targetType}:${targetId}:${analyteId}`;

function ValidityBadge({ record }: { record: MockMeasurementRecord }) {
  if (record.validity === "valid") {
    return (
      <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
        valid
      </Badge>
    );
  }
  if (record.validity === "rejected") {
    return (
      <Badge variant="destructive" title={record.validityReason ?? ""}>
        rejected
      </Badge>
    );
  }
  return <Badge variant="secondary">pending</Badge>;
}

// One tiny form per decision button — each result gets its own attributed
// status transition (AC 3).
function ValidButton({ batchId, recordId }: { batchId: string; recordId: string }) {
  const [state, submit, pending] = useActionState(setValidityAction, initialState);
  return (
    <form action={submit} className="inline">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="validity" value="valid" />
      <Button type="submit" size="xs" variant="outline" disabled={pending} title="Set valid">
        ✓
      </Button>
      {state.error && <span className="ml-1 text-xs text-destructive">{state.error}</span>}
    </form>
  );
}

function RejectDialog({
  batchId,
  record,
  label,
  onDone,
}: {
  batchId: string;
  record: MockMeasurementRecord;
  label: string;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(setValidityAction, initialState);
  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject — {label}</DialogTitle>
          <DialogDescription>
            The rejected result + reason stays in the record and anchors the nonconforming-work
            record (epic E). Re-measurement goes via set-back; a value that will not be
            re-measured stands as rejected-with-reason.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="recordId" value={record.id} />
          <input type="hidden" name="validity" value="rejected" />
          <p className="font-mono text-sm">{display(record.value)}</p>
          <div className="space-y-2">
            <Label htmlFor="rej-reason">Reason (required)</Label>
            <Textarea id="rej-reason" name="reason" required />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" variant="destructive" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Reject result"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseGapDialog({
  batchId,
  gap,
  onDone,
}: {
  batchId: string;
  gap: ReviewView["gaps"][number];
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(closeGapAction, initialState);
  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Close gap — {gap.label} × {gap.analyteName}
          </DialogTitle>
          <DialogDescription>
            The other route is a set-back (Steps tab), which reopens entry for re-measurement.
            Closing here records an explicit no-result with your reason.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="targetType" value="sample" />
          <input type="hidden" name="targetId" value={gap.targetId} />
          <input type="hidden" name="analyteId" value={gap.analyteId} />
          <div className="space-y-2">
            <Label htmlFor="gap-reason">Reason (required)</Label>
            <Textarea id="gap-reason" name="reason" required placeholder="e.g. insufficient sample volume after rework" />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Close as no result"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// AC 8: post-completion replace — supersede with mandatory reason + §7.8.8 flag.
function ReplaceDialog({
  batchId,
  view,
  target,
  analyteId,
  current,
  onDone,
}: {
  batchId: string;
  view: ReviewView;
  target: ResultTarget;
  analyteId: string;
  current: MockMeasurementRecord;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(replaceResultAction, initialState);
  const [kind, setKind] = useState("numeric");
  const column = view.columns.find((c) => c.analyteId === analyteId);
  const wireKind =
    kind === "censored-lt" || kind === "censored-gt"
      ? "censored"
      : kind.startsWith("qualifier:")
        ? "qualifier"
        : kind;

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Replace (post-completion) — {target.targetId} · {column?.name}
          </DialogTitle>
          <DialogDescription>
            The original stays visible in the chain, and the batch is flagged{" "}
            <strong>report impact — amendment check required (§7.8.8)</strong> until epic F&apos;s
            amendment flow consumes it.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="targetType" value={target.targetType} />
          <input type="hidden" name="targetId" value={target.targetId} />
          <input type="hidden" name="analyteId" value={analyteId} />
          {/* The record shown as "Current" below: the server anchors the
              replacement to it, so two managers replacing the same cell in
              overlapping sessions refuse instead of silently chaining the
              second §7.8.8 reason onto the first replacement (pass-3 fix). */}
          <input type="hidden" name="expectedCurrentRecordId" value={current.id} />
          <input type="hidden" name="valueKind" value={wireKind} />
          {(kind === "censored-lt" || kind === "censored-gt") && (
            <input type="hidden" name="qualifier" value={kind === "censored-lt" ? "<" : ">"} />
          )}
          {kind.startsWith("qualifier:") && (
            <input type="hidden" name="qualifierId" value={kind.slice("qualifier:".length)} />
          )}
          <p className="text-sm">
            Current: <span className="font-mono">{display(current.value)}</span>
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => v && setKind(v)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="numeric">Numeric</SelectItem>
                  <SelectItem value="censored-lt">&lt; (below boundary)</SelectItem>
                  <SelectItem value="censored-gt">&gt; (above boundary)</SelectItem>
                  {view.qualifiers.map((q) => (
                    <SelectItem key={q.id} value={`qualifier:${q.id}`}>
                      {q.name} (qualifier)
                    </SelectItem>
                  ))}
                  <SelectItem value="text">Qualitative text</SelectItem>
                  <SelectItem value="no-result">No result (with reason)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {kind === "numeric" && (
              <div className="space-y-1">
                <Label htmlFor="rep-raw">Value{column?.unit ? ` (${column.unit})` : ""}</Label>
                <Input id="rep-raw" name="raw" className="w-36 font-mono" autoFocus />
              </div>
            )}
            {(kind === "censored-lt" || kind === "censored-gt") && (
              <div className="space-y-1">
                <Label htmlFor="rep-boundary">Boundary</Label>
                <Input
                  id="rep-boundary"
                  name="boundaryRaw"
                  className="w-36 font-mono"
                  defaultValue={kind === "censored-lt" ? (column?.loq ?? "") : ""}
                />
              </div>
            )}
            {kind === "text" && (
              <div className="flex-1 space-y-1">
                <Label htmlFor="rep-text">Text</Label>
                <Input id="rep-text" name="text" />
              </div>
            )}
          </div>
          {kind === "no-result" && (
            <div className="space-y-1">
              <Label htmlFor="rep-nores">No-result reason (required)</Label>
              <Textarea id="rep-nores" name="noResultReason" />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="rep-reason">Replacement reason (required, §7.8.8)</Label>
            <Textarea id="rep-reason" name="replaceReason" required />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Replace result"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompleteControls({ batchId, view }: { batchId: string; view: ReviewView }) {
  const [allState, allSubmit, allPending] = useActionState(validateAllAction, initialState);
  const [doneState, doneSubmit, donePending] = useActionState(completeBatchAction, initialState);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={allSubmit}>
          <input type="hidden" name="batchId" value={batchId} />
          <Button type="submit" size="sm" variant="outline" disabled={allPending || view.undecidedCount === 0}>
            {allPending ? "…" : `Validate all unflagged (${view.undecidedCount})`}
          </Button>
        </form>
        <form action={doneSubmit}>
          <input type="hidden" name="batchId" value={batchId} />
          <Button type="submit" size="sm" disabled={donePending || view.completeBlockers.length > 0}>
            {donePending ? "…" : "Complete batch"}
          </Button>
        </form>
        {view.completeBlockers.length > 0 && (
          <span className="text-xs text-destructive">blocked: {view.completeBlockers.join(" · ")}</span>
        )}
      </div>
      {(allState.error || doneState.error) && (
        <Alert variant="destructive">
          <AlertDescription>{allState.error ?? doneState.error}</AlertDescription>
        </Alert>
      )}
      <p className="text-xs text-muted-foreground">
        Completion is the approval act and is final — corrections afterwards go through
        replace-with-reason (§7.8.8 flagged); a structural redo is a new batch.
      </p>
    </div>
  );
}

type PanelDialog =
  | { kind: "reject"; record: MockMeasurementRecord; label: string }
  | { kind: "chain"; cellKey: string; label: string }
  | { kind: "close-gap"; gap: ReviewView["gaps"][number] }
  | { kind: "replace"; target: ResultTarget; analyteId: string; current: MockMeasurementRecord }
  | null;

// US-D6 AC 1: the review view — grid read-only, origins + chains visible, QC
// expectations side by side, NO automated verdict (that is epic E's job).
export function ReviewPanel({ batchId, view }: { batchId: string; view: ReviewView }) {
  const [dialog, setDialog] = useState<PanelDialog>(null);
  const close = () => setDialog(null);
  const reviewing = view.batchStatus === "awaiting-review";
  const completed = view.batchStatus === "completed";

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {reviewing ? "Review" : "Results (reviewed)"}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {reviewing
              ? `${view.undecidedCount} pending · ${view.gaps.length} gap(s)`
              : completed
                ? "locked — corrections via replace-with-reason only"
                : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {view.amendmentFlagged && (
          <Alert variant="destructive">
            <AlertDescription>
              ⚠ Report impact — <strong>amendment check required (§7.8.8)</strong>: one or more
              results were replaced after completion. Epic F&apos;s amendment flow consumes this
              flag.
            </AlertDescription>
          </Alert>
        )}
        {reviewing && !view.canReview && view.reviewBlockedReason && (
          <Alert>
            <AlertDescription>{view.reviewBlockedReason}</AlertDescription>
          </Alert>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Row</TableHead>
                {view.columns.map((c) => (
                  <TableHead key={c.analyteId}>
                    {c.name}
                    <span className="ml-1 font-normal text-muted-foreground">
                      {c.unit ? `(${c.unit})` : "(no unit)"}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.rows.map((row) => (
                <TableRow key={`${row.targetType}:${row.targetId}`}>
                  <TableCell>
                    <span className="font-mono text-xs font-medium">{row.label}</span>
                    {row.targetType === "qc" && (
                      <Badge variant="outline" className="ml-2">
                        QC
                      </Badge>
                    )}
                    {/* voided from the job side after batching — the reviewer
                        must see it before validating (review fix, pass 2) */}
                    {row.voided && (
                      <Badge variant="destructive" className="ml-2">
                        voided
                      </Badge>
                    )}
                    <p className="max-w-44 truncate text-xs text-muted-foreground">{row.sub}</p>
                  </TableCell>
                  {view.columns.map((column) => {
                    const cell = view.cells[key(row.targetType, row.targetId, column.analyteId)];
                    const expectation =
                      row.targetType === "qc"
                        ? view.qcExpectations[`${row.targetId}:${column.analyteId}`]
                        : undefined;
                    const label = `${row.label} · ${column.name}`;
                    return (
                      <TableCell key={column.analyteId} className="align-top">
                        {cell?.current ? (
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                className="rounded px-1 font-mono text-sm hover:bg-muted"
                                title={`${cell.current.origin} · ${cell.current.enteredBy} · open chain`}
                                onClick={() =>
                                  setDialog({ kind: "chain", cellKey: key(row.targetType, row.targetId, column.analyteId), label })
                                }
                              >
                                {display(cell.current.value)}
                                {cell.chain.length > 1 && " ⟳"}
                              </button>
                              <span className="text-[10px] uppercase text-muted-foreground">
                                {cell.current.origin}
                              </span>
                              <ValidityBadge record={cell.current} />
                              {cell.current.amendmentCheckRequired && (
                                <span title="Replaced after completion — amendment check required (§7.8.8)">⚠</span>
                              )}
                              {reviewing && view.canReview && cell.current.validity !== "valid" && (
                                <ValidButton batchId={batchId} recordId={cell.current.id} />
                              )}
                              {reviewing && view.canReview && cell.current.validity !== "rejected" && (
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="ghost"
                                  className="text-destructive"
                                  title="Reject with reason"
                                  onClick={() => setDialog({ kind: "reject", record: cell.current!, label })}
                                >
                                  ✗
                                </Button>
                              )}
                              {completed && view.canReview && (
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="ghost"
                                  onClick={() =>
                                    setDialog({
                                      kind: "replace",
                                      target: { targetType: row.targetType, targetId: row.targetId },
                                      analyteId: column.analyteId,
                                      current: cell.current!,
                                    })
                                  }
                                >
                                  Replace…
                                </Button>
                              )}
                            </div>
                            {expectation && (
                              <p className="text-xs text-muted-foreground">{expectation}</p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="text-muted-foreground">—</span>
                            {expectation && (
                              <p className="text-xs text-muted-foreground">{expectation}</p>
                            )}
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {reviewing && view.gaps.length > 0 && (
          <div className="space-y-1 rounded border p-2">
            <p className="text-sm font-medium">
              Gaps: {view.gaps.length} — no silent holes; each is filled via set-back (Steps tab)
              or explicitly closed as no result + reason.
            </p>
            {view.gaps.map((gap) => (
              <div key={`${gap.targetId}:${gap.analyteId}`} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs">
                  {gap.label} × {gap.analyteName}
                </span>
                {view.canReview && (
                  <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "close-gap", gap })}>
                    Close as no result…
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {reviewing && view.canReview && <CompleteControls batchId={batchId} view={view} />}
        <p className="text-xs text-muted-foreground">
          No pass/fail verdict is rendered — automated QC evaluation is epic E; this view gives
          the human reviewer the exact lot expectations and reporting limits to judge against.
        </p>

        {dialog?.kind === "reject" && (
          <RejectDialog batchId={batchId} record={dialog.record} label={dialog.label} onDone={close} />
        )}
        {dialog?.kind === "close-gap" && (
          <CloseGapDialog batchId={batchId} gap={dialog.gap} onDone={close} />
        )}
        {dialog?.kind === "replace" && (
          <ReplaceDialog
            batchId={batchId}
            view={view}
            target={dialog.target}
            analyteId={dialog.analyteId}
            current={dialog.current}
            onDone={close}
          />
        )}
        {dialog?.kind === "chain" && (
          <Dialog open onOpenChange={(o) => !o && close()}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record chain — {dialog.label}</DialogTitle>
                <DialogDescription>Newest first; nothing is ever overwritten.</DialogDescription>
              </DialogHeader>
              <ul className="space-y-1.5">
                {(view.cells[dialog.cellKey]?.chain ?? []).map((r, i) => (
                  <li key={r.id} className="text-xs">
                    <span className="font-mono">{display(r.value)}</span>
                    {i === 0 ? " (current)" : " (superseded)"} · {r.origin}
                    {r.worksheetVersion ? ` v${r.worksheetVersion}` : ""} · {r.enteredBy} · {fmt(r.enteredAt)}
                    {r.supersedeReason && (
                      <span className="text-muted-foreground"> — corrects the previous: {r.supersedeReason}</span>
                    )}
                    <span className="text-muted-foreground">
                      {" "}
                      · {r.validity}
                      {r.validityReason ? ` (${r.validityReason})` : ""}
                      {r.validitySetBy ? ` by ${r.validitySetBy}` : ""}
                    </span>
                    {r.amendmentCheckRequired && " · ⚠ §7.8.8"}
                  </li>
                ))}
              </ul>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

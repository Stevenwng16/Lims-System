"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import type { BulkPreviewCell, GridCell, ResultsGrid } from "@/lib/batches";
import type { MockMeasurementRecord, ResultValue } from "@/lib/mock-db";
import {
  confirmPasteAction,
  confirmWorksheetAction,
  enterResultAction,
  previewPasteAction,
  previewWorksheetAction,
  type BatchFormState,
  type BulkFormState,
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
const initialBulk: BulkFormState = {};

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

// One cell: current value, kind picker, LOQ default on "<", supersede reason
// when correcting, and the full ⟳ chain (AC 2/3/4/8).
function CellDialog({
  batchId,
  grid,
  row,
  column,
  cell,
  canEnter,
  onDone,
}: {
  batchId: string;
  grid: ResultsGrid;
  row: ResultsGrid["rows"][number];
  column: ResultsGrid["columns"][number];
  cell: GridCell | undefined;
  canEnter: boolean;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(enterResultAction, initialState);
  const [kind, setKind] = useState<string>("numeric");
  const isCorrection = !!cell?.current;
  // The picker's value maps onto the wire kinds the action expects.
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {row.label} · {column.name}
            {column.unit ? ` (${column.unit})` : ""}
          </DialogTitle>
          <DialogDescription>
            {isCorrection
              ? "Correcting creates a new record with your reason — the original stays in the chain below."
              : "The value is stored with full precision exactly as entered, attributed to you."}
          </DialogDescription>
        </DialogHeader>

        {canEnter && (
          <form action={submit} className="space-y-4">
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="targetType" value={row.targetType} />
            <input type="hidden" name="targetId" value={row.targetId} />
            <input type="hidden" name="analyteId" value={column.analyteId} />
            <input type="hidden" name="valueKind" value={wireKind} />
            {(kind === "censored-lt" || kind === "censored-gt") && (
              <input type="hidden" name="qualifier" value={kind === "censored-lt" ? "<" : ">"} />
            )}
            {kind.startsWith("qualifier:") && (
              <input type="hidden" name="qualifierId" value={kind.slice("qualifier:".length)} />
            )}

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
                    {grid.qualifiers.map((q) => (
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
                  <Label htmlFor="cell-raw">Value{column.unit ? ` (${column.unit})` : ""}</Label>
                  <Input id="cell-raw" name="raw" className="w-36 font-mono" autoFocus placeholder="e.g. 12.4" />
                </div>
              )}
              {(kind === "censored-lt" || kind === "censored-gt") && (
                <div className="space-y-1">
                  <Label htmlFor="cell-boundary">Boundary</Label>
                  <Input
                    id="cell-boundary"
                    name="boundaryRaw"
                    className="w-36 font-mono"
                    // AC 4: "<" defaults its boundary to the analyte's LOQ.
                    defaultValue={kind === "censored-lt" ? (column.loq ?? "") : ""}
                    placeholder="e.g. 0.010"
                  />
                </div>
              )}
              {kind === "text" && (
                <div className="flex-1 space-y-1">
                  <Label htmlFor="cell-text">Text</Label>
                  <Input id="cell-text" name="text" placeholder="e.g. brown colour" />
                </div>
              )}
            </div>
            {kind === "no-result" && (
              <div className="space-y-1">
                <Label htmlFor="cell-nores">Reason (required — closes this cell out)</Label>
                <Textarea id="cell-nores" name="noResultReason" placeholder="e.g. sample volume insufficient after rework" />
              </div>
            )}

            {isCorrection && (
              <div className="space-y-1">
                <Label htmlFor="cell-reason">Correction reason (required)</Label>
                <Textarea id="cell-reason" name="supersedeReason" required placeholder="Why the previous value is replaced" />
              </div>
            )}

            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Saving…" : isCorrection ? "Save correction" : "Save result"}
            </Button>
          </form>
        )}

        {cell && cell.chain.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">
              Record chain {cell.chain.length > 1 && "⟳"} (newest first — nothing is ever overwritten)
            </p>
            <ul className="space-y-1.5">
              {cell.chain.map((r: MockMeasurementRecord, i) => (
                <li key={r.id} className="text-xs">
                  <span className="font-mono">{display(r.value)}</span>
                  {i === 0 ? " (current)" : " (superseded)"} · {r.origin}
                  {r.worksheetVersion ? ` v${r.worksheetVersion}` : ""} · {r.enteredBy} · {fmt(r.enteredAt)}
                  {r.supersedeReason && (
                    <span className="text-muted-foreground"> — corrects the previous: {r.supersedeReason}</span>
                  )}
                  <span className="text-muted-foreground"> · validity: {r.validity}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Shared preview table for paste (AC 13) and worksheet auto-read (AC 14).
function PreviewTable({ cells, columns }: { cells: BulkPreviewCell[]; columns: ResultsGrid["columns"] }) {
  const analyteName = (id: string) => columns.find((c) => c.analyteId === id)?.name ?? id;
  return (
    <div className="max-h-72 overflow-y-auto rounded border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Row</TableHead>
            <TableHead>Analyte</TableHead>
            <TableHead>Input</TableHead>
            <TableHead>Outcome</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cells.map((c, i) => (
            <TableRow key={i}>
              <TableCell className="font-mono text-xs">{c.rowLabel}</TableCell>
              <TableCell className="text-sm">{analyteName(c.analyteId)}</TableCell>
              <TableCell className="font-mono text-xs">{c.raw}</TableCell>
              <TableCell className="text-xs">
                {c.outcome.kind === "accepted" && (
                  <span className="text-emerald-700 dark:text-emerald-400">✓ {c.outcome.display}</span>
                )}
                {c.outcome.kind === "rejected" && <span className="text-destructive">✗ {c.outcome.message}</span>}
                {c.outcome.kind === "occupied" && (
                  <span className="text-amber-700 dark:text-amber-400">occupied — correct manually with a reason</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// AC 13: paste a rectangular block; parsed server-side, written on confirm.
function PasteDialog({
  batchId,
  grid,
  onDone,
}: {
  batchId: string;
  grid: ResultsGrid;
  onDone: () => void;
}) {
  const [previewState, previewSubmit, previewPending] = useActionState(previewPasteAction, initialBulk);
  const [confirmState, confirmSubmit, confirmPending] = useActionState(confirmPasteAction, initialBulk);
  const [block, setBlock] = useState("");
  const [startRow, setStartRow] = useState("0");

  useEffect(() => {
    if (confirmState.success) onDone();
  }, [confirmState, onDone]);

  // The client only maps POSITIONS (which cell each token lands in); every
  // value is parsed and validated server-side (AC 5).
  const entriesJson = useMemo(() => {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() !== "");
    const start = Number(startRow);
    const entries: { targetType: string; targetId: string; analyteId: string; raw: string }[] = [];
    lines.forEach((line, r) => {
      const row = grid.rows[start + r];
      if (!row) return;
      line.split("\t").forEach((token, c) => {
        const column = grid.columns[c];
        if (!column || token.trim() === "") return;
        entries.push({
          targetType: row.targetType,
          targetId: row.targetId,
          analyteId: column.analyteId,
          raw: token.trim(),
        });
      });
    });
    return JSON.stringify(entries);
  }, [block, startRow, grid]);

  return (
    <Dialog open onOpenChange={(o) => !o && !previewPending && !confirmPending && onDone()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste results block</DialogTitle>
          <DialogDescription>
            Copy a rectangular block from your spreadsheet (rows in grid order, columns{" "}
            {grid.columns.map((c) => c.name).join(", ")}). Nothing is written until you confirm;
            rejected and occupied cells stay for manual handling.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label>First pasted line is row</Label>
              <Select value={startRow} onValueChange={(v) => v && setStartRow(v)}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {grid.rows.map((r, i) => (
                    <SelectItem key={`${r.targetType}:${r.targetId}`} value={String(i)}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea
            value={block}
            onChange={(e) => setBlock(e.target.value)}
            placeholder={"12.4\t0.82\t3.1\n<0.010\t<0.005\tn.b."}
            className="min-h-28 font-mono text-xs"
            aria-label="Pasted block"
          />
          <form action={previewSubmit}>
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="entriesJson" value={entriesJson} />
            <Button type="submit" size="sm" variant="outline" disabled={previewPending || block.trim() === ""}>
              {previewPending ? "Parsing…" : "Preview"}
            </Button>
          </form>
          {previewState.error && (
            <Alert variant="destructive">
              <AlertDescription>{previewState.error}</AlertDescription>
            </Alert>
          )}
          {previewState.preview && (
            <>
              <PreviewTable cells={previewState.preview} columns={grid.columns} />
              <form action={confirmSubmit} className="space-y-2">
                <input type="hidden" name="batchId" value={batchId} />
                <input type="hidden" name="entriesJson" value={entriesJson} />
                {confirmState.error && (
                  <Alert variant="destructive">
                    <AlertDescription>{confirmState.error}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  disabled={confirmPending || !previewState.preview.some((c) => c.outcome.kind === "accepted")}
                >
                  {confirmPending
                    ? "Writing…"
                    : `Confirm ${previewState.preview.filter((c) => c.outcome.kind === "accepted").length} accepted cell(s)`}
                </Button>
              </form>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// AC 14: read the worksheet's Results sheet into a pending preview.
function WorksheetReadDialog({ batchId, grid, onDone }: { batchId: string; grid: ResultsGrid; onDone: () => void }) {
  const [previewState, previewSubmit, previewPending] = useActionState(previewWorksheetAction, initialBulk);
  const [confirmState, confirmSubmit, confirmPending] = useActionState(confirmWorksheetAction, initialBulk);

  useEffect(() => {
    if (confirmState.success) onDone();
  }, [confirmState, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !previewPending && !confirmPending && onDone()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Read results from the worksheet</DialogTitle>
          <DialogDescription>
            The latest worksheet version&apos;s Results sheet is read under the same validation as
            manual entry — you review the preview, and records are written only on confirm (origin
            &quot;worksheet&quot;, referencing that version). A missing or mismatching sheet is a
            notice, never a gate.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <form action={previewSubmit}>
            <input type="hidden" name="batchId" value={batchId} />
            <Button type="submit" size="sm" variant="outline" disabled={previewPending}>
              {previewPending ? "Reading…" : `Read worksheet v${grid.worksheetCount}`}
            </Button>
          </form>
          {previewState.error && (
            <Alert>
              <AlertDescription>{previewState.error}</AlertDescription>
            </Alert>
          )}
          {previewState.preview && (
            <>
              {(previewState.notices ?? []).map((n) => (
                <p key={n} className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠ {n}
                </p>
              ))}
              <PreviewTable cells={previewState.preview} columns={grid.columns} />
              <form action={confirmSubmit} className="space-y-2">
                <input type="hidden" name="batchId" value={batchId} />
                {confirmState.error && (
                  <Alert variant="destructive">
                    <AlertDescription>{confirmState.error}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  disabled={confirmPending || !previewState.preview.some((c) => c.outcome.kind === "accepted")}
                >
                  {confirmPending
                    ? "Writing…"
                    : `Confirm ${previewState.preview.filter((c) => c.outcome.kind === "accepted").length} accepted cell(s)`}
                </Button>
              </form>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type GridDialog =
  | { kind: "cell"; rowIndex: number; columnIndex: number }
  | { kind: "paste" }
  | { kind: "worksheet" }
  | null;

export function ResultsGridSection({
  batchId,
  grid,
  canEnter,
}: {
  batchId: string;
  grid: ResultsGrid;
  canEnter: boolean;
}) {
  const [dialog, setDialog] = useState<GridDialog>(null);
  const close = () => setDialog(null);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>
          Results{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {grid.entryOpen ? "entry open" : "entry closed"} · {grid.filled}/{grid.total} filled
          </span>
        </CardTitle>
        {canEnter && grid.entryOpen && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "paste" })}>
              Paste block…
            </Button>
            {grid.worksheetCount > 0 && (
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "worksheet" })}>
                Read from worksheet…
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!grid.entryOpen && grid.entryClosedReason && (
          <Alert className="mb-3">
            <AlertDescription>{grid.entryClosedReason}</AlertDescription>
          </Alert>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Row</TableHead>
                {grid.columns.map((c) => (
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
              {grid.rows.map((row, rowIndex) => (
                <TableRow key={`${row.targetType}:${row.targetId}`}>
                  <TableCell>
                    <span className="font-mono text-xs font-medium">{row.label}</span>
                    {row.targetType === "qc" && (
                      <Badge variant="outline" className="ml-2">
                        QC
                      </Badge>
                    )}
                    <p className="max-w-44 truncate text-xs text-muted-foreground">{row.sub}</p>
                  </TableCell>
                  {grid.columns.map((column, columnIndex) => {
                    const cell = grid.cells[key(row.targetType, row.targetId, column.analyteId)];
                    const clickable = canEnter && grid.entryOpen;
                    return (
                      <TableCell key={column.analyteId}>
                        <button
                          type="button"
                          onClick={() => setDialog({ kind: "cell", rowIndex, columnIndex })}
                          disabled={!clickable && !cell}
                          className={`rounded px-1.5 py-0.5 text-left font-mono text-sm ${
                            clickable || cell ? "hover:bg-muted" : ""
                          } ${!cell ? "text-muted-foreground" : ""}`}
                          title={
                            cell?.current
                              ? `${cell.current.origin} · ${cell.current.enteredBy}`
                              : clickable
                                ? "Enter result"
                                : undefined
                          }
                        >
                          {cell?.current ? (
                            <>
                              {cell.current.value.kind === "no-result" ? (
                                <span className="italic">no result</span>
                              ) : (
                                display(cell.current.value)
                              )}
                              {cell.chain.length > 1 && <span title="Corrected — open for the chain"> ⟳</span>}
                            </>
                          ) : (
                            "—"
                          )}
                        </button>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Values are stored with full precision exactly as entered; comma or point decimals are
          accepted only when unambiguous — never guessed. Corrections require a reason and keep
          the original (⟳ opens the chain). Agreement with QC expectations is judged in epic E,
          not at entry.
        </p>

        {dialog?.kind === "cell" && (
          <CellDialog
            key={`${dialog.rowIndex}:${dialog.columnIndex}`}
            batchId={batchId}
            grid={grid}
            row={grid.rows[dialog.rowIndex]}
            column={grid.columns[dialog.columnIndex]}
            cell={grid.cells[key(grid.rows[dialog.rowIndex].targetType, grid.rows[dialog.rowIndex].targetId, grid.columns[dialog.columnIndex].analyteId)]}
            canEnter={canEnter && grid.entryOpen}
            onDone={close}
          />
        )}
        {dialog?.kind === "paste" && <PasteDialog batchId={batchId} grid={grid} onDone={close} />}
        {dialog?.kind === "worksheet" && <WorksheetReadDialog batchId={batchId} grid={grid} onDone={close} />}
      </CardContent>
    </Card>
  );
}

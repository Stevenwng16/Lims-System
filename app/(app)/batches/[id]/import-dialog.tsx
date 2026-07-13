"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import type { ImportPreviewRow, ResultsGrid } from "@/lib/batches";
import { confirmImportAction, previewImportAction, type ImportFormState } from "../actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const initialState: ImportFormState = {};

export type ImportConfigOption = { id: string; name: string; fileType: string };

type Resolution = { action: "map"; targetKey: string } | { action: "skip"; reason: string };

function matchLabel(row: ImportPreviewRow): { label: string; tone: "ok" | "warn" | "bad" } {
  switch (row.match.kind) {
    case "sample":
      return { label: row.match.id, tone: "ok" };
    case "qc":
      return { label: `${row.match.code} (QC)`, tone: "ok" };
    case "out-of-batch":
      return { label: `${row.match.sampleId} — not in this batch`, tone: "bad" };
    // Two batch QC entries share this code — auto-picking one would be a
    // silent wrong-target write; the user maps to the intended lot (pass-4).
    case "ambiguous-qc":
      return { label: `${row.match.code} — two QC entries share this code, map to the intended lot`, tone: "warn" };
    case "unknown":
      return { label: "no match in this batch", tone: "warn" };
  }
}

// US-D5 AC 3: file + configuration → parse → preview → confirm. Nothing is
// written before confirm; unresolved rows keep confirm blocked (AC 4).
export function ImportDialog({
  batchId,
  grid,
  configs,
  onDone,
}: {
  batchId: string;
  grid: ResultsGrid;
  configs: ImportConfigOption[];
  onDone: () => void;
}) {
  const [previewState, previewSubmit, previewPending] = useActionState(previewImportAction, initialState);
  const [confirmState, confirmSubmit, confirmPending] = useActionState(confirmImportAction, initialState);
  const [configId, setConfigId] = useState(configs[0]?.id ?? "");
  const [resolutions, setResolutions] = useState<Map<number, Resolution>>(new Map());
  const [replaceAll, setReplaceAll] = useState(false);
  const [replaceCells, setReplaceCells] = useState<Set<string>>(new Set()); // `${row}:${analyte}`

  useEffect(() => {
    if (confirmState.success) onDone();
  }, [confirmState, onDone]);

  const preview = previewState.preview ?? null;

  // Reset resolutions whenever a new preview lands.
  useEffect(() => {
    setResolutions(new Map());
    setReplaceAll(false);
    setReplaceCells(new Set());
  }, [preview?.token]);

  const targetOptions = useMemo(
    () =>
      grid.rows.map((r) => ({
        key: `${r.targetType}:${r.targetId}`,
        // QC options carry name + FROZEN lot (the row sub) so two entries
        // sharing a code stay distinguishable in the map dropdown (pass-4).
        label: r.targetType === "qc" ? `${r.label} (QC${r.sub ? ` · ${r.sub}` : ""})` : r.label,
      })),
    [grid.rows],
  );

  const needsResolution = (row: ImportPreviewRow) =>
    row.match.kind === "unknown" || row.match.kind === "out-of-batch" || row.match.kind === "ambiguous-qc";
  const unresolved = (preview?.rows ?? []).filter((row) => {
    if (!needsResolution(row)) return false;
    const res = resolutions.get(row.rowNumber);
    if (!res) return true;
    if (res.action === "skip") return !res.reason.trim();
    return row.match.kind === "out-of-batch"; // out-of-batch: only skippable
  });

  const anyReplace = replaceAll || replaceCells.size > 0;

  const resolutionsJson = JSON.stringify(
    [...resolutions].map(([rowNumber, res]) =>
      res.action === "map"
        ? {
            rowNumber,
            action: "map",
            target: {
              targetType: res.targetKey.startsWith("qc:") ? "qc" : "sample",
              targetId: res.targetKey.slice(res.targetKey.indexOf(":") + 1),
            },
          }
        : { rowNumber, action: "skip", reason: res.reason },
    ),
  );
  const replaceCellsJson = JSON.stringify(
    [...replaceCells].map((key) => {
      const idx = key.indexOf(":");
      return { rowNumber: Number(key.slice(0, idx)), analyteName: key.slice(idx + 1) };
    }),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !previewPending && !confirmPending && onDone()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import into {batchId}</DialogTitle>
          <DialogDescription>
            File + configuration → preview → confirm. Nothing is written before you confirm; the
            original file is stored with its checksum and the applied mapping at the import event.
          </DialogDescription>
        </DialogHeader>

        <form action={previewSubmit} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="configId" value={configId} />
          <div className="space-y-1">
            <Label>Configuration</Label>
            <Select value={configId} onValueChange={(v) => v && setConfigId(v)}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Choose a configuration" />
              </SelectTrigger>
              <SelectContent>
                {configs.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.fileType})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="imp-file">Export file</Label>
            <Input id="imp-file" name="file" type="file" accept=".csv,.txt,.xlsx" />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={previewPending || !configId}>
            {previewPending ? "Parsing…" : "Preview"}
          </Button>
        </form>
        {configs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No active import configurations for this lab yet — a manager creates them under
            Batches ▸ Import configurations.
          </p>
        )}
        {previewState.error && (
          <Alert variant="destructive">
            <AlertDescription>{previewState.error}</AlertDescription>
          </Alert>
        )}

        {preview && (
          <div className="space-y-3">
            <p className="text-sm">
              <strong>{preview.fileName}</strong> · {preview.rows.length} rows ·{" "}
              {preview.rows.filter((r) => r.match.kind === "sample").length} matched samples ·{" "}
              {preview.rows.filter((r) => r.match.kind === "qc").length} QC ·{" "}
              {unresolved.length} unresolved · {preview.conflictCount} conflict cell(s)
            </p>
            {preview.unitErrors.map((e) => (
              <Alert key={e} variant="destructive">
                <AlertDescription>{e}</AlertDescription>
              </Alert>
            ))}
            {preview.notices.map((n) => (
              <p key={n} className="text-xs text-amber-700 dark:text-amber-400">
                ⚠ {n}
              </p>
            ))}

            <div className="max-h-80 space-y-1 overflow-y-auto rounded border p-2">
              {preview.rows.map((row) => {
                const m = matchLabel(row);
                const res = resolutions.get(row.rowNumber);
                return (
                  <div key={row.rowNumber} className="rounded px-1 py-1 text-sm odd:bg-muted/30">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-8 shrink-0 text-right font-mono text-xs text-muted-foreground">
                        {row.rowNumber}.
                      </span>
                      <span className="w-40 shrink-0 truncate font-mono text-xs">{row.idCell || "—"}</span>
                      <span
                        className={
                          m.tone === "ok"
                            ? "text-xs text-muted-foreground"
                            : m.tone === "warn"
                              ? "text-xs font-medium text-amber-700 dark:text-amber-400"
                              : "text-xs font-medium text-destructive"
                        }
                      >
                        {m.label}
                      </span>
                      {row.cells.map((cell) => (
                        <span key={cell.analyteName} className="inline-flex items-center gap-1 text-xs">
                          <span className="text-muted-foreground">{cell.analyteName}</span>
                          {cell.verdict.kind === "ok" && <span className="font-mono">{cell.verdict.display} ✓</span>}
                          {cell.verdict.kind === "conflict" && (
                            <span className="font-mono text-amber-700 dark:text-amber-400" title={`existing: ${cell.verdict.existing}`}>
                              {cell.verdict.display} ⟳
                              <Checkbox
                                className="ml-1 align-middle"
                                checked={replaceAll || replaceCells.has(`${row.rowNumber}:${cell.analyteName}`)}
                                disabled={replaceAll}
                                onCheckedChange={(c) =>
                                  setReplaceCells((s) => {
                                    const next = new Set(s);
                                    const key = `${row.rowNumber}:${cell.analyteName}`;
                                    if (c === true) next.add(key);
                                    else next.delete(key);
                                    return next;
                                  })
                                }
                                aria-label={`Replace ${cell.analyteName} in row ${row.rowNumber}`}
                              />
                            </span>
                          )}
                          {cell.verdict.kind === "rejected" && (
                            <span className="text-destructive" title={cell.verdict.message}>
                              ✗
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                    {needsResolution(row) && (
                      <div className="ml-10 mt-1 flex flex-wrap items-center gap-2">
                        {(row.match.kind === "unknown" || row.match.kind === "ambiguous-qc") && (
                          <Select
                            value={res?.action === "map" ? res.targetKey : ""}
                            onValueChange={(v) =>
                              v && setResolutions((r) => new Map(r).set(row.rowNumber, { action: "map", targetKey: v }))
                            }
                          >
                            <SelectTrigger size="sm" className="w-56" aria-label={`Map row ${row.rowNumber}`}>
                              <SelectValue placeholder="Map to…" />
                            </SelectTrigger>
                            <SelectContent>
                              {targetOptions.map((t) => (
                                <SelectItem key={t.key} value={t.key}>
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Input
                          value={res?.action === "skip" ? res.reason : ""}
                          onChange={(e) =>
                            setResolutions((r) => new Map(r).set(row.rowNumber, { action: "skip", reason: e.target.value }))
                          }
                          placeholder="…or skip with a reason"
                          className="h-7 w-64"
                          aria-label={`Skip reason for row ${row.rowNumber}`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <form action={confirmSubmit} className="space-y-3">
              <input type="hidden" name="batchId" value={batchId} />
              <input type="hidden" name="token" value={preview.token} />
              <input type="hidden" name="resolutionsJson" value={resolutionsJson} />
              <input type="hidden" name="replaceCellsJson" value={replaceCellsJson} />
              <input type="hidden" name="replaceAll" value={String(replaceAll)} />
              {preview.conflictCount > 0 && (
                <div className="space-y-2 rounded border p-2">
                  <p className="text-sm">
                    {preview.conflictCount} cell(s) already hold a value — default is{" "}
                    <strong>keep existing</strong> (AC 7).
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={replaceAll} onCheckedChange={(c) => setReplaceAll(c === true)} />
                    Replace all conflicts (or tick individual ⟳ cells above)
                  </label>
                  {anyReplace && (
                    <div className="space-y-1">
                      <Label htmlFor="imp-reason">Replace reason (required — recorded on each superseded value)</Label>
                      <Textarea id="imp-reason" name="supersedeReason" required />
                    </div>
                  )}
                </div>
              )}
              {confirmState.error && (
                <Alert variant="destructive">
                  <AlertDescription>{confirmState.error}</AlertDescription>
                </Alert>
              )}
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={confirmPending || unresolved.length > 0}>
                  {confirmPending ? "Importing…" : "Confirm import"}
                </Button>
                {unresolved.length > 0 && (
                  <span className="text-xs text-destructive">
                    blocked: {unresolved.length} unresolved row(s) — map or skip with a reason
                  </span>
                )}
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { X } from "lucide-react";
import type { MockImportConfig } from "@/lib/mock-db";
import {
  saveImportConfigAction,
  setImportConfigStatusAction,
  type BatchFormState,
} from "../actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";

const initialState: BatchFormState = {};

type ColumnRow = { key: string; header: string; analyteName: string; unit: string | null };
let rowSeq = 1;
const newKey = () => `col-${rowSeq++}`;

type LabOption = { id: string; name: string };

function ConfigDialog({
  labs,
  source,
  onDone,
}: {
  labs: LabOption[];
  source: MockImportConfig | null; // null = create
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(saveImportConfigAction, initialState);
  // Masterdata exemption (triage decision 11): the dialog picks the lab, like
  // the QC-materials dialog — the page is no longer active-lab-scoped.
  const [labId, setLabId] = useState(source?.labId ?? labs[0]?.id ?? "");
  const [fileType, setFileType] = useState<"csv" | "excel">(source?.fileType ?? "csv");
  const [orientation, setOrientation] = useState<"wide" | "long">(source?.orientation ?? "wide");
  const [decimalSeparator, setDecimalSeparator] = useState<"comma" | "point">(
    source?.decimalSeparator ?? "comma",
  );
  const [csvDelimiter, setCsvDelimiter] = useState<"comma" | "semicolon" | "tab">(
    source?.csvDelimiter ?? "semicolon",
  );
  const [columns, setColumns] = useState<ColumnRow[]>(
    source && source.orientation === "wide"
      ? source.columns.map((c) => ({ key: newKey(), ...c }))
      : [{ key: newKey(), header: "", analyteName: "", unit: "" }],
  );
  const [longUnits, setLongUnits] = useState<ColumnRow[]>(
    source && source.orientation === "long"
      ? source.longUnits.map((u) => ({ key: newKey(), header: "", analyteName: u.analyteName, unit: u.unit }))
      : [{ key: newKey(), header: "", analyteName: "", unit: "" }],
  );

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  const patch = (
    setter: typeof setColumns,
    key: string,
    change: Partial<ColumnRow>,
  ) => setter((rows) => rows.map((r) => (r.key === key ? { ...r, ...change } : r)));

  const unitRow = (row: ColumnRow, setter: typeof setColumns, withHeader: boolean) => (
    <div key={row.key} className="flex flex-wrap items-center gap-2">
      {withHeader && (
        <Input
          value={row.header}
          onChange={(e) => patch(setter, row.key, { header: e.target.value })}
          placeholder="File column header"
          className="w-40"
          aria-label="File column header"
        />
      )}
      <Input
        value={row.analyteName}
        onChange={(e) => patch(setter, row.key, { analyteName: e.target.value })}
        placeholder="Analyte (e.g. Pb)"
        className="w-32"
        aria-label="Analyte name"
      />
      <Input
        value={row.unit ?? ""}
        onChange={(e) => patch(setter, row.key, { unit: e.target.value })}
        placeholder="Unit"
        className="w-24"
        disabled={row.unit === null}
        aria-label="Unit"
      />
      <label className="flex items-center gap-1 text-xs">
        <Checkbox
          checked={row.unit === null}
          onCheckedChange={(c) => patch(setter, row.key, { unit: c ? null : "" })}
        />
        no unit
      </label>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Remove row"
        onClick={() => setter((rows) => rows.filter((r) => r.key !== row.key))}
      >
        <X />
      </Button>
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{source ? `Edit — ${source.name}` : "New import configuration"}</DialogTitle>
          <DialogDescription>
            Separators are declared here and never auto-detected; each mapped analyte carries its
            unit, which must equal the method&apos;s unit at import (the factor-1000 guard).
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          {source && <input type="hidden" name="configId" value={source.id} />}
          <input type="hidden" name="labId" value={labId} />
          <input type="hidden" name="fileType" value={fileType} />
          <input type="hidden" name="orientation" value={orientation} />
          <input type="hidden" name="decimalSeparator" value={decimalSeparator} />
          <input type="hidden" name="csvDelimiter" value={csvDelimiter} />
          <input
            type="hidden"
            name="columnsJson"
            value={JSON.stringify(columns.map(({ header, analyteName, unit }) => ({ header, analyteName, unit })))}
          />
          <input
            type="hidden"
            name="longUnitsJson"
            value={JSON.stringify(longUnits.map(({ analyteName, unit }) => ({ analyteName, unit })))}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cfg-name">Name</Label>
              <Input id="cfg-name" name="name" defaultValue={source?.name ?? ""} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Lab</Label>
              <Select value={labId} onValueChange={(v) => v && setLabId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a lab" />
                </SelectTrigger>
                <SelectContent>
                  {labs.map((lab) => (
                    <SelectItem key={lab.id} value={lab.id}>
                      {lab.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-id-col">ID column (sample / QC code)</Label>
              <Input id="cfg-id-col" name="idColumn" defaultValue={source?.idColumn ?? "Sample"} required />
            </div>
            <div className="space-y-2">
              <Label>File type</Label>
              <Select value={fileType} onValueChange={(v) => v && setFileType(v as "csv" | "excel")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Orientation</Label>
              <Select value={orientation} onValueChange={(v) => v && setOrientation(v as "wide" | "long")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wide">Wide — one row per sample</SelectItem>
                  <SelectItem value="long">Long — one row per measurement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Decimal separator (declared)</Label>
              <Select value={decimalSeparator} onValueChange={(v) => v && setDecimalSeparator(v as "comma" | "point")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comma">Comma (12,4)</SelectItem>
                  <SelectItem value="point">Point (12.4)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {fileType === "csv" && (
              <div className="space-y-2">
                <Label>CSV delimiter (declared)</Label>
                <Select value={csvDelimiter} onValueChange={(v) => v && setCsvDelimiter(v as typeof csvDelimiter)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semicolon">Semicolon (;)</SelectItem>
                    <SelectItem value="comma">Comma (,)</SelectItem>
                    <SelectItem value="tab">Tab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {fileType === "excel" && (
              <div className="space-y-2">
                <Label htmlFor="cfg-sheet">Sheet name (declared)</Label>
                <Input
                  id="cfg-sheet"
                  name="sheetName"
                  defaultValue={source?.sheetName ?? ""}
                  placeholder="e.g. Results"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  The import reads exactly this sheet — never whatever happens to be first in tab
                  order.
                </p>
              </div>
            )}
          </div>

          {orientation === "wide" ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Analyte columns (header → analyte + unit)</legend>
              {columns.map((row) => unitRow(row, setColumns, true))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setColumns((rows) => [...rows, { key: newKey(), header: "", analyteName: "", unit: "" }])}
              >
                + Add column
              </Button>
            </fieldset>
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Long layout</legend>
              <div className="flex gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cfg-analyte-col">Analyte column</Label>
                  <Input id="cfg-analyte-col" name="analyteColumn" defaultValue={source?.analyteColumn ?? "Element"} className="w-40" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cfg-value-col">Value column</Label>
                  <Input id="cfg-value-col" name="valueColumn" defaultValue={source?.valueColumn ?? "Result"} className="w-40" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Units per analyte name:</p>
              {longUnits.map((row) => unitRow(row, setLongUnits, false))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLongUnits((rows) => [...rows, { key: newKey(), header: "", analyteName: "", unit: "" }])}
              >
                + Add analyte unit
              </Button>
            </fieldset>
          )}

          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : source ? "Save configuration" : "Create configuration"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({ config, onDone }: { config: MockImportConfig; onDone: () => void }) {
  const [state, submit, pending] = useActionState(setImportConfigStatusAction, initialState);
  const deactivating = config.status === "active";

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {deactivating ? "Deactivate" : "Reactivate"} — {config.name}
          </DialogTitle>
          <DialogDescription>
            Configurations are deactivated, never deleted — past imports stay explainable because
            every import event froze the mapping it applied.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="configId" value={config.id} />
          <input type="hidden" name="status" value={deactivating ? "inactive" : "active"} />
          <div className="space-y-2">
            <Label htmlFor="cfg-reason">Reason (required)</Label>
            <Textarea id="cfg-reason" name="reason" required />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : deactivating ? "Deactivate" : "Reactivate"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type DialogState = { kind: "create" } | { kind: "edit"; id: string } | { kind: "status"; id: string } | null;

export function ImportConfigsClient({
  labs,
  configs,
}: {
  labs: LabOption[];
  configs: MockImportConfig[];
}) {
  const labNames = new Map(labs.map((l) => [l.id, l.name] as const));
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);
  const source = dialog && dialog.kind !== "create" ? (configs.find((c) => c.id === dialog.id) ?? null) : null;

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialog({ kind: "create" })}>
          + New configuration
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Lab</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Orientation</TableHead>
              <TableHead>Separators</TableHead>
              <TableHead>Mapping</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.map((c) => (
              <TableRow key={c.id} className={c.status === "inactive" ? "opacity-60" : undefined}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{labNames.get(c.labId) ?? c.labId}</TableCell>
                <TableCell className="uppercase">{c.fileType}</TableCell>
                <TableCell className="capitalize">{c.orientation}</TableCell>
                <TableCell className="text-sm">
                  decimal: {c.decimalSeparator === "comma" ? "," : "."}
                  {c.fileType === "csv" &&
                    ` · ${c.csvDelimiter === "semicolon" ? ";" : c.csvDelimiter === "comma" ? "," : "tab"}`}
                </TableCell>
                <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
                  {c.orientation === "wide"
                    ? c.columns.map((col) => `${col.header}→${col.analyteName}`).join(", ")
                    : `${c.analyteColumn}/${c.valueColumn}`}
                </TableCell>
                <TableCell>
                  {c.status === "active" ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="xs" onClick={() => setDialog({ kind: "edit", id: c.id })}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => setDialog({ kind: "status", id: c.id })}>
                      {c.status === "active" ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {configs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No import configurations in this lab yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {dialog?.kind === "create" && <ConfigDialog labs={labs} source={null} onDone={close} />}
      {dialog?.kind === "edit" && source && (
        <ConfigDialog key={source.id} labs={labs} source={source} onDone={close} />
      )}
      {dialog?.kind === "status" && source && <StatusDialog config={source} onDone={close} />}
    </>
  );
}

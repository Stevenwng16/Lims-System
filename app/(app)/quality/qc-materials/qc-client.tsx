"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { X } from "lucide-react";
import type { MockQcMaterial, QcType } from "@/lib/mock-db";
import type { QcListItem } from "@/lib/qc";
import {
  createQcMaterialAction,
  updateQcMaterialAction,
  uploadCertificateAction,
  type QcFormState,
} from "./actions";
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
import { DateInput } from "@/components/ui/date-input";
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

const initialState: QcFormState = {};

const TYPE_LABELS: Record<QcType, string> = {
  blank: "Blank",
  "control-standard": "Control standard",
  crm: "CRM (certified)",
};

type LabOption = { id: string; name: string };

type ValueRow = {
  key: string;
  id: string;
  analyteName: string;
  unit: string | null;
  expectedValue: string;
  toleranceKind: "absolute" | "percent";
  toleranceValue: string;
};

let rowSeq = 1;
const newRowKey = () => `ev-${rowSeq++}`;

function blankRow(): ValueRow {
  return {
    key: newRowKey(),
    id: "",
    analyteName: "",
    unit: "",
    expectedValue: "",
    toleranceKind: "absolute",
    toleranceValue: "",
  };
}

function rowsFromMaterial(m: MockQcMaterial): ValueRow[] {
  return m.expectedValues.map((ev) => ({
    key: ev.id,
    id: ev.id,
    analyteName: ev.analyteName,
    unit: ev.unit,
    expectedValue: ev.expectedValue,
    toleranceKind: ev.tolerance.kind,
    toleranceValue: ev.tolerance.value,
  }));
}

// Shared create/edit form. `mode` decides the action; "new-lot" prefills from
// an existing material but creates a NEW record (US-B2 AC 7).
function MaterialDialog({
  mode,
  source,
  labs,
  onDone,
}: {
  mode: "create" | "edit" | "new-lot";
  source: MockQcMaterial | null; // null for plain create
  labs: LabOption[];
  onDone: () => void;
}) {
  const isEdit = mode === "edit";
  const [state, submit, pending] = useActionState(
    isEdit ? updateQcMaterialAction : createQcMaterialAction,
    initialState,
  );
  const [certState, uploadCert, certPending] = useActionState(uploadCertificateAction, initialState);
  const [type, setType] = useState<QcType>(source?.type ?? "control-standard");
  const [labId, setLabId] = useState(source?.labId ?? labs[0]?.id ?? "");
  const [rows, setRows] = useState<ValueRow[]>(
    source && source.type !== "blank"
      ? // A new lot is a NEW record — drop the source's ev ids so the server
        // mints fresh ones (audit finding 12).
        rowsFromMaterial(source).map((r) => (mode === "new-lot" ? { ...r, id: "" } : r))
      : [],
  );
  const v = state.values; // echoed back on error to survive React 19's reset
  const [status, setStatus] = useState<"active" | "inactive">(source?.status ?? "active");
  const statusChanged = isEdit && source ? status !== source.status : false;

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  const patchRow = (key: string, patch: Partial<ValueRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const isBlank = type === "blank";
  const expectedValuesJson = JSON.stringify(
    isBlank
      ? []
      : rows.map((r) => ({
          id: r.id || undefined,
          analyteName: r.analyteName,
          unit: r.unit,
          expectedValue: r.expectedValue,
          tolerance: { kind: r.toleranceKind, value: r.toleranceValue },
        })),
  );

  const titles: Record<typeof mode, string> = {
    create: "New QC material",
    edit: `Edit QC material — ${source?.name ?? ""}`,
    "new-lot": `New lot of ${source?.name ?? ""}`,
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titles[mode]}</DialogTitle>
          <DialogDescription>
            {mode === "new-lot"
              ? "A new lot is entered as a new record — the old lot keeps its own values and history (AC 7). The code must be unique among active materials in the lab, so give this lot a different code or deactivate the old lot first."
              : "The type determines how epic E judges results: Blank = below the method's reporting limit; Control standard / CRM = value ± tolerance."}
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          {isEdit && source && <input type="hidden" name="materialId" value={source.id} />}
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="labId" value={labId} />
          <input type="hidden" name="expectedValuesJson" value={expectedValuesJson} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="qc-name">Name</Label>
              <Input id="qc-name" name="name" defaultValue={v?.name ?? source?.name ?? ""} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qc-code">Code (matched at instrument import)</Label>
              <Input
                id="qc-code"
                name="code"
                defaultValue={v?.code ?? source?.code ?? ""}
                required
                maxLength={12}
                className="w-32 font-mono uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(next) => {
                  // Don't wipe rows on switch to Blank — they're already
                  // omitted from the payload and hidden, so the switch is
                  // reversible with no data loss (audit finding 9).
                  if (next) setType(next as QcType);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as QcType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lab</Label>
              <Select value={labId} onValueChange={(next) => next && setLabId(next)}>
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
              <Label htmlFor="qc-supplier">Supplier (optional)</Label>
              <Input id="qc-supplier" name="supplier" defaultValue={v?.supplier ?? source?.supplier ?? ""} />
            </div>
            <div className="flex gap-3">
              <div className="space-y-2">
                <Label htmlFor="qc-lot">Lot number{isBlank ? " (optional)" : ""}</Label>
                <Input
                  id="qc-lot"
                  name="lotNumber"
                  defaultValue={v?.lotNumber ?? (mode === "new-lot" ? "" : (source?.lotNumber ?? ""))}
                  className="w-36"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qc-expiry">Expiry{isBlank ? " (optional)" : ""}</Label>
                <DateInput
                  id="qc-expiry"
                  name="expiryDate"
                  defaultValue={v?.expiryDate ?? (mode === "new-lot" ? "" : (source?.expiryDate ?? ""))}
                  className="w-40"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qc-desc">Description (optional)</Label>
            <Textarea id="qc-desc" name="description" defaultValue={v?.description ?? source?.description ?? ""} />
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="qc-cert-create">
                Certificate (optional{type === "crm" ? " — recommended for CRMs" : ""})
              </Label>
              <Input id="qc-cert-create" name="certificate" type="file" accept=".pdf,image/*" />
              {type === "crm" && (
                <p className="text-xs text-muted-foreground">
                  A CRM carries a certificate for metrological traceability (ISO 17034) — upload it
                  now or later via Edit.
                </p>
              )}
            </div>
          )}

          {!isBlank && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">
                Expected values (± absolute or % tolerance, per analyte)
              </legend>
              {rows.map((r) => (
                <div key={r.key} className="flex flex-wrap items-center gap-2">
                  <Input
                    value={r.analyteName}
                    onChange={(e) => patchRow(r.key, { analyteName: e.target.value })}
                    placeholder="Analyte (e.g. Pb)"
                    className="w-32"
                    aria-label="Analyte name"
                  />
                  <Input
                    value={r.unit ?? ""}
                    onChange={(e) => patchRow(r.key, { unit: e.target.value })}
                    placeholder="Unit"
                    className="w-24"
                    disabled={r.unit === null}
                    aria-label="Unit"
                  />
                  <label className="flex items-center gap-1 text-xs">
                    <Checkbox
                      checked={r.unit === null}
                      onCheckedChange={(c) => patchRow(r.key, { unit: c ? null : "" })}
                    />
                    no unit
                  </label>
                  <Input
                    value={r.expectedValue}
                    onChange={(e) => patchRow(r.key, { expectedValue: e.target.value })}
                    placeholder="Value"
                    className="w-24"
                    aria-label="Expected value"
                  />
                  <Select
                    value={r.toleranceKind}
                    onValueChange={(next) => next && patchRow(r.key, { toleranceKind: next as "absolute" | "percent" })}
                  >
                    <SelectTrigger size="sm" className="w-20" aria-label="Tolerance kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="absolute">±</SelectItem>
                      <SelectItem value="percent">%</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={r.toleranceValue}
                    onChange={(e) => patchRow(r.key, { toleranceValue: e.target.value })}
                    placeholder="Tolerance"
                    className="w-24"
                    aria-label="Tolerance value"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Remove analyte"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blankRow()])}>
                + Add analyte
              </Button>
              <p className="text-xs text-muted-foreground">
                Values use a decimal point (e.g. 5.0). Analytes match methods by name
                (case-insensitive) and unit.
              </p>
            </fieldset>
          )}

          {isEdit && source && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Status</legend>
              <div className="flex gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={status === "active"} onChange={() => setStatus("active")} />
                  Active
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={status === "inactive"} onChange={() => setStatus("inactive")} />
                  Inactive
                </label>
              </div>
              <input type="hidden" name="status" value={status} />
              {statusChanged && (
                <div className="space-y-2">
                  <Label htmlFor="qc-status-reason">
                    Reason for {status === "inactive" ? "deactivating" : "reactivating"} (required)
                  </Label>
                  <Textarea id="qc-status-reason" name="statusReason" defaultValue={v?.statusReason ?? ""} required />
                </div>
              )}
              {source.statusReason && !statusChanged && (
                <p className="text-xs text-muted-foreground">Last status change: {source.statusReason}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Materials are deactivated, never deleted — historical batch QC records stay intact.
              </p>
            </fieldset>
          )}

          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save material" : "Create material"}
          </Button>
        </form>

        {isEdit && source && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Certificate {source.type === "crm" && "(CRM traceability)"}</p>
            {source.certificate ? (
              <p className="break-all font-mono text-xs text-muted-foreground">
                {source.certificate.fileName} · sha256 {source.certificate.sha256.slice(0, 16)}… ·
                uploaded {source.certificate.uploadedAt}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No certificate uploaded.
                {source.type === "crm" &&
                  " A CRM carries a certificate for metrological traceability (ISO 17034)."}
              </p>
            )}
            <form action={uploadCert} className="flex items-end gap-2">
              <input type="hidden" name="materialId" value={source.id} />
              <div className="flex-1 space-y-1">
                <Label htmlFor="qc-cert">{source.certificate ? "Replace certificate" : "Upload certificate"}</Label>
                <Input id="qc-cert" name="file" type="file" accept=".pdf,image/*" />
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={certPending}>
                {certPending ? "Uploading…" : "Upload"}
              </Button>
            </form>
            {certState.error && (
              <Alert variant="destructive">
                <AlertDescription>{certState.error}</AlertDescription>
              </Alert>
            )}
            {certState.success && (
              <Alert>
                <AlertDescription>Certificate uploaded.</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExpiryCell({ item }: { item: QcListItem }) {
  if (item.expiry === "none") return <span className="text-muted-foreground">—</span>;
  if (item.expiry === "expired") {
    return (
      <span className="flex items-center gap-2">
        {item.expiryDate} <Badge variant="destructive">expired</Badge>
      </span>
    );
  }
  if (item.expiry === "soon") {
    return (
      <span className="font-medium text-amber-700 dark:text-amber-400">
        {item.expiryDate} ⚠ expires soon
      </span>
    );
  }
  return <span>{item.expiryDate}</span>;
}

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; id: string }
  | { mode: "new-lot"; id: string }
  | null;

export function QcClient({
  materials,
  details,
  labs,
  canManage,
}: {
  materials: QcListItem[];
  details: Record<string, MockQcMaterial>;
  labs: LabOption[];
  canManage: boolean;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);
  const source = dialog && dialog.mode !== "create" ? (details[dialog.id] ?? null) : null;

  // When editing a material whose lab was deactivated (grandfathered), the
  // active-labs list omits it — add it back marked "(inactive)" so the Select
  // shows the current lab and it stays re-selectable (audit finding 14).
  const labOptions: LabOption[] =
    source && !labs.some((l) => l.id === source.labId)
      ? [
          ...labs,
          {
            id: source.labId,
            name: `${materials.find((m) => m.id === source.id)?.labName ?? source.labId} (inactive)`,
          },
        ]
      : labs;

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">QC materials</h1>
        {canManage && (
          <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
            + New QC material
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Lab</TableHead>
              <TableHead>Lot</TableHead>
              <TableHead className="text-right">Analytes</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {materials.map((m) => (
              <TableRow key={m.id} className={m.status === "inactive" ? "opacity-60" : undefined}>
                <TableCell className="font-medium">
                  {m.name}
                  {m.hasCertificate && (
                    <span className="ml-2 text-xs text-muted-foreground" title="Certificate on file">
                      📄
                    </span>
                  )}
                  {m.type === "crm" && !m.hasCertificate && (
                    <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                      no certificate
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">{m.code}</TableCell>
                <TableCell>{TYPE_LABELS[m.type]}</TableCell>
                <TableCell>{m.labName}</TableCell>
                <TableCell className="font-mono text-sm">{m.lotNumber || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.type === "blank" ? "—" : m.analyteCount}
                </TableCell>
                <TableCell>
                  <ExpiryCell item={m} />
                </TableCell>
                <TableCell>
                  {m.status === "active" ? (
                    <Badge variant="outline">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="xs" onClick={() => setDialog({ mode: "edit", id: m.id })}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setDialog({ mode: "new-lot", id: m.id })}>
                        New lot
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {materials.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 9 : 8} className="text-center text-muted-foreground">
                  No QC materials in your lab(s) yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Expired materials cannot be selected when composing a batch (epic D); pass/fail comparison
        against these values runs in epic E.
      </p>

      {dialog?.mode === "create" && (
        <MaterialDialog mode="create" source={null} labs={labs} onDone={close} />
      )}
      {dialog?.mode === "edit" && source && (
        <MaterialDialog key={source.id} mode="edit" source={source} labs={labOptions} onDone={close} />
      )}
      {dialog?.mode === "new-lot" && source && (
        <MaterialDialog key={`lot-${source.id}`} mode="new-lot" source={source} labs={labOptions} onDone={close} />
      )}
    </>
  );
}

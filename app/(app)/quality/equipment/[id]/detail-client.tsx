"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import type { CheckCriterion, MockCheckEntry } from "@/lib/mock-db";
import type { CheckTypeView, EquipmentDetail } from "@/lib/equipment";
import {
  addCheckTypeAction,
  logCheckAction,
  outOfServiceAction,
  returnToServiceAction,
  saveLinksAction,
  setCheckTypeStatusAction,
  setEquipmentStatusAction,
  updateCalibrationAction,
  updateCheckTypeAction,
  updateEquipmentAction,
  uploadCertificateAction,
  type EquipmentFormState,
} from "../actions";
import { StateBadge } from "../equipment-client";
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

const initialState: EquipmentFormState = {};

type Option = { id: string; name: string };
type LinkableMethod = { id: string; name: string; steps: { id: string; name: string }[] };

const FREQUENCY_LABELS = { "per-use": "Per use", daily: "Daily", weekly: "Weekly" } as const;

function fmt(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

function criterionText(c: CheckCriterion): string {
  if (c.kind === "manual") return c.description;
  const unit = c.unit ? ` ${c.unit}` : "";
  const tol = c.tolerance.kind === "percent" ? `${c.tolerance.value}%` : `${c.tolerance.value}${unit}`;
  return `${c.expectedValue}${unit} ± ${tol}`;
}

function ResultBadge({ entry }: { entry: MockCheckEntry }) {
  return (
    <span className="inline-flex items-center gap-1">
      {entry.result === "pass" ? (
        <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
          Pass
        </Badge>
      ) : (
        <Badge variant="destructive">Fail</Badge>
      )}
      {entry.resultComputed && (
        <span className="text-xs text-muted-foreground" title="Computed from the numeric criterion">
          computed
        </span>
      )}
    </span>
  );
}

function ErrorAlert({ state }: { state: EquipmentFormState }) {
  if (!state.error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  );
}

function EditEquipmentDialog({
  detail,
  typeOptions,
  labOptions,
  onDone,
}: {
  detail: EquipmentDetail;
  typeOptions: Option[];
  labOptions: Option[];
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(updateEquipmentAction, initialState);
  const eq = detail.record;
  const [typeId, setTypeId] = useState(eq.typeId);
  const [labId, setLabId] = useState(eq.labId);
  const v = state.values;

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit equipment — {eq.name}</DialogTitle>
          <DialogDescription>
            Every change is recorded in the equipment history with its old and new value.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="equipmentId" value={eq.id} />
          <input type="hidden" name="typeId" value={typeId} />
          <input type="hidden" name="labId" value={labId} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="eqe-name">Name</Label>
              <Input id="eqe-name" name="name" defaultValue={v?.name ?? eq.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eqe-asset">Equipment ID</Label>
              {/* Fixed once created: the ID names the physical asset and is
                  never changed or reissued — the server rejects any change
                  (review fix, pass 2). */}
              <Input
                id="eqe-asset"
                name="assetId"
                defaultValue={eq.assetId}
                readOnly
                className="w-40 bg-muted font-mono"
                title="The equipment ID is fixed once created — it names the physical asset."
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={typeId} onValueChange={(next) => next && setTypeId(next)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lab</Label>
              <Select value={labId} onValueChange={(next) => next && setLabId(next)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {labOptions.map((lab) => (
                    <SelectItem key={lab.id} value={lab.id}>
                      {lab.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eqe-manufacturer">Manufacturer</Label>
              <Input id="eqe-manufacturer" name="manufacturer" defaultValue={v?.manufacturer ?? eq.manufacturer} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eqe-model">Model</Label>
              <Input id="eqe-model" name="model" defaultValue={v?.model ?? eq.model} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eqe-serial">Serial number</Label>
              <Input id="eqe-serial" name="serialNumber" defaultValue={v?.serialNumber ?? eq.serialNumber} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eqe-location">Location</Label>
              <Input id="eqe-location" name="location" defaultValue={v?.location ?? eq.location} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eqe-desc">Description</Label>
            <Textarea id="eqe-desc" name="description" defaultValue={v?.description ?? eq.description} />
          </div>
          <ErrorAlert state={state} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save equipment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CalibrationDialog({ detail, onDone }: { detail: EquipmentDetail; onDone: () => void }) {
  const [state, submit, pending] = useActionState(updateCalibrationAction, initialState);
  const cal = detail.record.calibration;
  const v = state.values;

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update calibration</DialogTitle>
          <DialogDescription>
            The due date derives from the last calibration plus the interval; enter it manually
            only when the certificate states a different one. Renewing the calibration is what
            clears an expiry block — the requirement itself can never be removed.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="equipmentId" value={detail.record.id} />
          <div className="flex flex-wrap gap-3">
            <div className="space-y-2">
              <Label htmlFor="cal-interval">Interval (months)</Label>
              <Input
                id="cal-interval"
                name="intervalMonths"
                type="number"
                min={1}
                max={120}
                defaultValue={v?.intervalMonths ?? cal.intervalMonths ?? ""}
                className="w-28"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cal-last">Last calibration</Label>
              <Input
                id="cal-last"
                name="lastDate"
                type="date"
                defaultValue={v?.lastDate ?? cal.lastDate ?? ""}
                className="w-40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cal-due">Due date (manual)</Label>
              <Input
                id="cal-due"
                name="dueDate"
                type="date"
                defaultValue={v?.dueDate ?? (cal.dueDateManual ? (cal.dueDate ?? "") : "")}
                className="w-40"
              />
              <p className="text-xs text-muted-foreground">Leave empty to derive it.</p>
            </div>
          </div>
          <ErrorAlert state={state} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save calibration"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CheckTypeDialog({
  detail,
  source,
  onDone,
}: {
  detail: EquipmentDetail;
  source: CheckTypeView | null; // null = define new
  onDone: () => void;
}) {
  const isEdit = source !== null;
  const [state, submit, pending] = useActionState(
    isEdit ? updateCheckTypeAction : addCheckTypeAction,
    initialState,
  );
  const [frequency, setFrequency] = useState<keyof typeof FREQUENCY_LABELS>(source?.frequency ?? "daily");
  const [kind, setKind] = useState<"numeric" | "manual">(source?.criterion.kind ?? "numeric");
  const numeric = source?.criterion.kind === "numeric" ? source.criterion : null;
  const [toleranceKind, setToleranceKind] = useState<"absolute" | "percent">(
    numeric?.tolerance.kind ?? "absolute",
  );
  const [noUnit, setNoUnit] = useState(numeric ? numeric.unit === null : false);
  const v = state.values;

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit check type — ${source.name}` : "Define check type"}</DialogTitle>
          <DialogDescription>
            With a numeric criterion the system computes pass/fail from the measured value — it
            cannot be overridden. Changing a criterion never rewrites already-logged results.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="equipmentId" value={detail.record.id} />
          {isEdit && <input type="hidden" name="checkTypeId" value={source.id} />}
          <input type="hidden" name="frequency" value={frequency} />
          <input type="hidden" name="criterionKind" value={kind} />
          <div className="flex flex-wrap gap-3">
            <div className="space-y-2">
              <Label htmlFor="ct-name">Name</Label>
              <Input
                id="ct-name"
                name="ctName"
                defaultValue={v?.ctName ?? source?.name ?? ""}
                placeholder="e.g. Daily check"
                required
                className="w-48"
              />
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(next) => next && setFrequency(next as typeof frequency)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FREQUENCY_LABELS) as (keyof typeof FREQUENCY_LABELS)[]).map((f) => (
                    <SelectItem key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Acceptance criterion</legend>
            <div className="flex gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={kind === "numeric"} onChange={() => setKind("numeric")} />
                Numeric (value ± tolerance — result computed)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={kind === "manual"} onChange={() => setKind("manual")} />
                Descriptive (manual pass/fail)
              </label>
            </div>
          </fieldset>

          {kind === "numeric" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                name="expectedValue"
                defaultValue={v?.expectedValue ?? numeric?.expectedValue ?? ""}
                placeholder="Expected (e.g. 100.000)"
                className="w-36"
                aria-label="Expected value"
              />
              <Input
                name="unit"
                defaultValue={v?.unit ?? numeric?.unit ?? ""}
                placeholder="Unit"
                className="w-20"
                disabled={noUnit}
                aria-label="Unit"
              />
              <label className="flex items-center gap-1 text-xs">
                <Checkbox name="noUnit" checked={noUnit} onCheckedChange={(c) => setNoUnit(c === true)} />
                no unit
              </label>
              <Select
                value={toleranceKind}
                onValueChange={(next) => next && setToleranceKind(next as "absolute" | "percent")}
              >
                <SelectTrigger size="sm" className="w-20" aria-label="Tolerance kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="absolute">±</SelectItem>
                  <SelectItem value="percent">%</SelectItem>
                </SelectContent>
              </Select>
              <input type="hidden" name="toleranceKind" value={toleranceKind} />
              <Input
                name="toleranceValue"
                defaultValue={v?.toleranceValue ?? numeric?.tolerance.value ?? ""}
                placeholder="Tolerance"
                className="w-28"
                aria-label="Tolerance value"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="ct-desc">Criterion description</Label>
              <Textarea
                id="ct-desc"
                name="criterionDescription"
                defaultValue={
                  v?.criterionDescription ??
                  (source?.criterion.kind === "manual" ? source.criterion.description : "")
                }
                placeholder="What makes this check a pass?"
              />
            </div>
          )}
          <ErrorAlert state={state} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save check type" : "Define check type"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CheckTypeStatusDialog({
  detail,
  source,
  onDone,
}: {
  detail: EquipmentDetail;
  source: CheckTypeView;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(setCheckTypeStatusAction, initialState);
  const retiring = source.status === "active";

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {retiring ? "Retire" : "Reactivate"} check type — {source.name}
          </DialogTitle>
          <DialogDescription>
            {retiring
              ? "A retired check stops being required (it no longer blocks), but its logged history stays."
              : "The check becomes required again. If it was never performed or is overdue, the equipment blocks until a new check passes."}
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="equipmentId" value={detail.record.id} />
          <input type="hidden" name="checkTypeId" value={source.id} />
          <input type="hidden" name="status" value={retiring ? "inactive" : "active"} />
          <div className="space-y-2">
            <Label htmlFor="cts-reason">Reason (required)</Label>
            <Textarea id="cts-reason" name="reason" defaultValue={state.values?.reason ?? ""} required />
          </div>
          <ErrorAlert state={state} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : retiring ? "Retire check type" : "Reactivate check type"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LogCheckDialog({ detail, onDone }: { detail: EquipmentDetail; onDone: () => void }) {
  const [state, submit, pending] = useActionState(logCheckAction, initialState);
  const active = detail.checkTypes.filter((ct) => ct.status === "active");
  const [checkTypeId, setCheckTypeId] = useState(active[0]?.id ?? "");
  const selected = active.find((ct) => ct.id === checkTypeId) ?? null;
  const isNumeric = selected?.criterion.kind === "numeric";
  const v = state.values;

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log check — {detail.record.name}</DialogTitle>
          <DialogDescription>
            Checks are append-only: a typo is corrected with a new entry, never by editing. The
            performer and time are recorded automatically.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="equipmentId" value={detail.record.id} />
          <input type="hidden" name="checkTypeId" value={checkTypeId} />
          <div className="space-y-2">
            <Label>Check type</Label>
            <Select value={checkTypeId} onValueChange={(next) => next && setCheckTypeId(next)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a check type" />
              </SelectTrigger>
              <SelectContent>
                {active.map((ct) => (
                  <SelectItem key={ct.id} value={ct.id}>
                    {ct.name} ({FREQUENCY_LABELS[ct.frequency]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selected && (
            <p className="text-xs text-muted-foreground">
              Criterion: {criterionText(selected.criterion)}
              {isNumeric && " — pass/fail is computed from the measured value and cannot be overridden."}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="lc-measured">
              Measured value{isNumeric ? " (required)" : " (optional)"}
              {selected?.criterion.kind === "numeric" && selected.criterion.unit
                ? ` — ${selected.criterion.unit}`
                : ""}
            </Label>
            <Input
              id="lc-measured"
              name="measuredValue"
              defaultValue={v?.measuredValue ?? ""}
              placeholder="e.g. 100.001"
              className="w-40 font-mono"
              required={isNumeric}
            />
          </div>
          {!isNumeric && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Result</legend>
              <div className="flex gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="result" value="pass" required /> Pass
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="result" value="fail" /> Fail
                </label>
              </div>
            </fieldset>
          )}
          <div className="space-y-2">
            <Label htmlFor="lc-notes">Notes (optional)</Label>
            <Textarea id="lc-notes" name="notes" defaultValue={v?.notes ?? ""} />
          </div>
          <ErrorAlert state={state} />
          <Button type="submit" className="w-full" disabled={pending || !selected}>
            {pending ? "Saving…" : "Save check"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinksDialog({
  detail,
  linkableMethods,
  onDone,
}: {
  detail: EquipmentDetail;
  linkableMethods: LinkableMethod[];
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(saveLinksAction, initialState);
  const key = (methodId: string, stepId: string | null) => `${methodId}|${stepId ?? ""}`;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(detail.record.methodLinks.map((l) => key(l.methodId, l.stepId))),
  );

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  const toggle = (k: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(k);
      else next.delete(k);
      return next;
    });

  // Links whose method is no longer offered (deactivated / lab moved) stay
  // listed so they remain visible and can still be unlinked (grandfathered).
  const offered = new Set(linkableMethods.map((m) => m.id));
  const grandfathered = detail.links.filter((l) => !offered.has(l.methodId));

  const linksJson = JSON.stringify(
    [...selected].map((k) => {
      const [methodId, stepId] = [k.slice(0, k.indexOf("|")), k.slice(k.indexOf("|") + 1)];
      return { methodId, stepId: stepId === "" ? null : stepId };
    }),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Linked methods / steps</DialogTitle>
          <DialogDescription>
            A step requiring this equipment cannot be completed while it is Blocked (enforced in
            epic D). Linking the method as a whole applies to all of its steps.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="equipmentId" value={detail.record.id} />
          <input type="hidden" name="linksJson" value={linksJson} />
          {linkableMethods.length === 0 && grandfathered.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No active methods in this equipment&apos;s lab yet.
            </p>
          )}
          {linkableMethods.map((m) => (
            <div key={m.id} className="space-y-1">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={selected.has(key(m.id, null))}
                  onCheckedChange={(c) => toggle(key(m.id, null), c === true)}
                />
                {m.name} <span className="font-normal text-muted-foreground">(whole method)</span>
              </label>
              <div className="ml-6 space-y-1">
                {m.steps.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selected.has(key(m.id, s.id))}
                      onCheckedChange={(c) => toggle(key(m.id, s.id), c === true)}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {grandfathered.length > 0 && (
            <div className="space-y-1 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Held links to methods no longer offered here (inactive or moved) — uncheck to
                unlink:
              </p>
              {grandfathered.map((l) => (
                <label key={key(l.methodId, l.stepId)} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.has(key(l.methodId, l.stepId))}
                    onCheckedChange={(c) => toggle(key(l.methodId, l.stepId), c === true)}
                  />
                  {l.methodName}
                  {l.stepId ? ` → ${l.stepName ?? "(step removed)"}` : ""}
                  {l.methodStatus === "inactive" && <Badge variant="secondary">inactive</Badge>}
                  {l.methodStatus === "active" && !l.sameLab && (
                    <Badge variant="secondary">moved — other lab</Badge>
                  )}
                </label>
              ))}
            </div>
          )}
          <ErrorAlert state={state} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save links"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OutOfServiceDialog({ detail, onDone }: { detail: EquipmentDetail; onDone: () => void }) {
  const [state, submit, pending] = useActionState(outOfServiceAction, initialState);

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Take out of service — {detail.record.name}</DialogTitle>
          <DialogDescription>
            The equipment stays Blocked until an explicit return to service. Both actions are
            recorded in the history.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="equipmentId" value={detail.record.id} />
          <div className="space-y-2">
            <Label htmlFor="oos-reason">Reason (required)</Label>
            <Textarea id="oos-reason" name="reason" defaultValue={state.values?.reason ?? ""} required />
          </div>
          <ErrorAlert state={state} />
          <Button type="submit" variant="destructive" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Take out of service"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({ detail, onDone }: { detail: EquipmentDetail; onDone: () => void }) {
  const [state, submit, pending] = useActionState(setEquipmentStatusAction, initialState);
  const deactivating = detail.record.status === "active";

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {deactivating ? "Deactivate" : "Reactivate"} — {detail.record.name}
          </DialogTitle>
          <DialogDescription>
            Equipment is deactivated, never deleted — all calibration and check history is
            retained{deactivating ? " and it can be reactivated later" : ""}.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="equipmentId" value={detail.record.id} />
          <input type="hidden" name="status" value={deactivating ? "inactive" : "active"} />
          <div className="space-y-2">
            <Label htmlFor="st-reason">Reason (required)</Label>
            <Textarea id="st-reason" name="reason" defaultValue={state.values?.reason ?? ""} required />
          </div>
          <ErrorAlert state={state} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : deactivating ? "Deactivate equipment" : "Reactivate equipment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReturnToServiceForm({ detail }: { detail: EquipmentDetail }) {
  const [state, submit, pending] = useActionState(returnToServiceAction, initialState);
  return (
    <form action={submit} className="mt-3 flex items-end gap-2">
      <input type="hidden" name="equipmentId" value={detail.record.id} />
      <div className="flex-1 space-y-1">
        <Label htmlFor="rts-note">Return to service — note (optional)</Label>
        <Input id="rts-note" name="note" defaultValue={state.values?.note ?? ""} placeholder="e.g. repaired and verified" />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Return to service"}
      </Button>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

function CertificateBlock({ detail, canManage }: { detail: EquipmentDetail; canManage: boolean }) {
  const [state, submit, pending] = useActionState(uploadCertificateAction, initialState);
  const cert = detail.record.calibration.certificate;
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Calibration certificate</p>
      {cert ? (
        <p className="break-all font-mono text-xs text-muted-foreground">
          {cert.fileName} · sha256 {cert.sha256.slice(0, 16)}… · uploaded {cert.uploadedAt} by {cert.uploadedBy}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">No certificate on file.</p>
      )}
      {canManage && (
        <>
          <form action={submit} className="flex items-end gap-2">
            <input type="hidden" name="equipmentId" value={detail.record.id} />
            <div className="flex-1 space-y-1">
              <Label htmlFor="cert-file">{cert ? "Replace certificate" : "Upload certificate"}</Label>
              <Input id="cert-file" name="file" type="file" accept=".pdf,image/*" />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </form>
          <ErrorAlert state={state} />
        </>
      )}
    </div>
  );
}

type DialogState =
  | { kind: "edit" }
  | { kind: "calibration" }
  | { kind: "check-type"; id: string | null }
  | { kind: "check-type-status"; id: string }
  | { kind: "log-check" }
  | { kind: "links" }
  | { kind: "oos" }
  | { kind: "status" }
  | null;

export function EquipmentDetailClient({
  detail,
  typeOptions,
  labOptions,
  linkableMethods,
  canManage,
  canLog,
}: {
  detail: EquipmentDetail;
  typeOptions: Option[];
  labOptions: Option[];
  linkableMethods: LinkableMethod[];
  canManage: boolean;
  canLog: boolean;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);
  const eq = detail.record;
  const { availability } = detail;
  const checksDesc = [...eq.checks].sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  const eventsDesc = [...eq.events].sort((a, b) => b.at.localeCompare(a.at));
  const checkTypeName = (id: string) => eq.checkTypes.find((ct) => ct.id === id)?.name ?? id;
  const dialogCheckType =
    dialog?.kind === "check-type" || dialog?.kind === "check-type-status"
      ? (detail.checkTypes.find((ct) => ct.id === dialog.id) ?? null)
      : null;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {eq.name} <span className="font-mono text-base text-muted-foreground">({eq.assetId})</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StateBadge availability={availability} />
            {eq.status === "inactive" && <Badge variant="secondary">Inactive</Badge>}
          </div>
          {(availability.blockedReasons.length > 0 || availability.warnings.length > 0) && (
            <ul className="mt-2 space-y-0.5 text-sm">
              {availability.blockedReasons.map((r) => (
                <li key={r} className="text-destructive">
                  ● {r}
                </li>
              ))}
              {availability.warnings.map((w) => (
                <li key={w} className="text-amber-700 dark:text-amber-400">
                  ● {w}
                </li>
              ))}
            </ul>
          )}
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "edit" })}>
              Edit
            </Button>
            {!eq.outOfService && (
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "oos" })}>
                Take out of service
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "status" })}>
              {eq.status === "active" ? "Deactivate…" : "Reactivate…"}
            </Button>
          </div>
        )}
      </div>

      {eq.outOfService && (
        <Alert variant="destructive">
          <AlertTitle>Out of service</AlertTitle>
          <AlertDescription>
            <p>
              {eq.outOfService.reason} — since {fmt(eq.outOfService.since)} by {eq.outOfService.by}.
              Only an explicit return to service clears this.
            </p>
            {canManage && <ReturnToServiceForm detail={detail} />}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="calibration">Calibration</TabsTrigger>
          <TabsTrigger value="checks">Routine checks</TabsTrigger>
          <TabsTrigger value="methods">Methods</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              {(
                [
                  ["Type", `${detail.typeName}${detail.typeStatus === "inactive" ? " (inactive type)" : ""}`],
                  ["Lab", detail.labName],
                  ["Manufacturer", eq.manufacturer || "—"],
                  ["Model", eq.model || "—"],
                  ["Serial number", eq.serialNumber || "—"],
                  ["Location", eq.location || "—"],
                  ["Created", eq.createdAt],
                  ["Description", eq.description || "—"],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p>{value}</p>
                </div>
              ))}
              {eq.statusReason && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Last status change</p>
                  <p>{eq.statusReason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calibration" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Calibration</CardTitle>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "calibration" })}>
                  Update calibration
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-8 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Interval</p>
                  <p>{eq.calibration.intervalMonths ? `${eq.calibration.intervalMonths} months` : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last calibration</p>
                  <p>{eq.calibration.lastDate ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Due{eq.calibration.dueDateManual ? " (set manually)" : ""}
                  </p>
                  <p
                    className={
                      detail.calibrationState === "expired"
                        ? "font-medium text-destructive"
                        : detail.calibrationState === "due-soon"
                          ? "font-medium text-amber-700 dark:text-amber-400"
                          : undefined
                    }
                  >
                    {eq.calibration.dueDate ?? "—"}
                    {detail.calibrationState === "expired" && " (expired)"}
                    {detail.calibrationState === "due-soon" && " (due soon)"}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Calibration due dates within {detail.warningDays} days show as &quot;Due soon&quot;
                (configurable in Settings). An expired calibration blocks the equipment until a
                renewed calibration is recorded.
              </p>
              <CertificateBlock detail={detail} canManage={canManage} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checks" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Check types</CardTitle>
              <div className="flex gap-2">
                {canLog && detail.checkTypes.some((ct) => ct.status === "active") && eq.status === "active" && (
                  <Button size="sm" onClick={() => setDialog({ kind: "log-check" })}>
                    + Log check
                  </Button>
                )}
                {canManage && (
                  <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "check-type", id: null })}>
                    Define check type
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {detail.checkTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No routine checks defined. A defined scheduled check becomes required — the
                  equipment blocks until it is performed and passes.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Criterion</TableHead>
                      <TableHead>Last check</TableHead>
                      <TableHead>Next due</TableHead>
                      {canManage && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.checkTypes.map((ct) => (
                      <TableRow key={ct.id} className={ct.status === "inactive" ? "opacity-60" : undefined}>
                        <TableCell className="font-medium">
                          {ct.name}
                          {ct.status === "inactive" && (
                            <Badge variant="secondary" className="ml-2">
                              retired
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{FREQUENCY_LABELS[ct.frequency]}</TableCell>
                        <TableCell className="text-sm">{criterionText(ct.criterion)}</TableCell>
                        <TableCell className="text-sm">
                          {ct.lastEntry ? (
                            <span className="inline-flex items-center gap-2">
                              {fmt(ct.lastEntry.performedAt)} <ResultBadge entry={ct.lastEntry} />
                            </span>
                          ) : (
                            <span className="text-muted-foreground">never</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {ct.frequency === "per-use" ? (
                            <span className="text-muted-foreground">per use</span>
                          ) : (
                            (ct.nextDue ?? "—")
                          )}
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {ct.status === "active" && (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => setDialog({ kind: "check-type", id: ct.id })}
                                >
                                  Edit
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => setDialog({ kind: "check-type-status", id: ct.id })}
                              >
                                {ct.status === "active" ? "Retire" : "Reactivate"}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Check log (append-only)</CardTitle>
            </CardHeader>
            <CardContent>
              {checksDesc.length === 0 ? (
                <p className="text-sm text-muted-foreground">No checks logged yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date / time</TableHead>
                      <TableHead>Check</TableHead>
                      <TableHead>Performer</TableHead>
                      <TableHead>Measured</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checksDesc.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-xs">{fmt(entry.performedAt)}</TableCell>
                        <TableCell className="text-sm">{checkTypeName(entry.checkTypeId)}</TableCell>
                        <TableCell className="text-sm">{entry.performedBy}</TableCell>
                        <TableCell className="font-mono text-sm">{entry.measuredValue ?? "—"}</TableCell>
                        <TableCell>
                          <ResultBadge entry={entry} />
                        </TableCell>
                        <TableCell className="max-w-64 text-xs text-muted-foreground">
                          {entry.notes || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Entries are never edited or removed — corrections are new entries, and failed or
                late checks stay visible here even after the equipment recovers.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="methods" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Linked methods / steps</CardTitle>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "links" })}>
                  Edit links
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {detail.links.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Not linked to any method yet. The link is what drives equipment-gating in epic D.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {detail.links.map((l) => (
                    <li key={`${l.methodId}|${l.stepId ?? ""}`} className="flex items-center gap-2">
                      <span>
                        {l.methodName}
                        {l.stepId ? ` → ${l.stepName ?? "(step removed from current version)"}` : " (whole method)"}
                      </span>
                      {l.methodStatus === "inactive" && <Badge variant="secondary">inactive</Badge>}
                      {/* stale after a lab move: the same state the edit dialog
                          already flags — the read-only view must agree
                          (review fix, pass 2) */}
                      {l.methodStatus === "active" && !l.sameLab && (
                        <Badge variant="secondary">moved — other lab</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

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
                      <TableCell className="text-sm">
                        <span className="mr-2 text-xs uppercase text-muted-foreground">
                          {ev.type.replace(/-/g, " ")}
                        </span>
                        {ev.summary}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-muted-foreground">
                Whether anything was Blocked, when, and why stays answerable here — the real
                backend mirrors this into the organisation-wide audit log.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {dialog?.kind === "edit" && (
        <EditEquipmentDialog detail={detail} typeOptions={typeOptions} labOptions={labOptions} onDone={close} />
      )}
      {dialog?.kind === "calibration" && <CalibrationDialog detail={detail} onDone={close} />}
      {dialog?.kind === "check-type" && (
        <CheckTypeDialog
          key={dialog.id ?? "new"}
          detail={detail}
          source={dialogCheckType}
          onDone={close}
        />
      )}
      {dialog?.kind === "check-type-status" && dialogCheckType && (
        <CheckTypeStatusDialog detail={detail} source={dialogCheckType} onDone={close} />
      )}
      {dialog?.kind === "log-check" && <LogCheckDialog detail={detail} onDone={close} />}
      {dialog?.kind === "links" && (
        <LinksDialog detail={detail} linkableMethods={linkableMethods} onDone={close} />
      )}
      {dialog?.kind === "oos" && <OutOfServiceDialog detail={detail} onDone={close} />}
      {dialog?.kind === "status" && <StatusDialog detail={detail} onDone={close} />}
    </>
  );
}

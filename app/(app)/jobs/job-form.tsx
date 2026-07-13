"use client";

import { useState } from "react";
import { useActionState } from "react";
import { X } from "lucide-react";
import type { DeviationType } from "@/lib/mock-db";
import { createJobAction, updateJobAction, type JobFormState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput, DateTimeInput } from "@/components/ui/date-input";
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

const initialState: JobFormState = {};

type MethodOption = { id: string; label: string };
type TypeOption = { id: string; name: string };

type SampleRow = {
  key: string;
  id?: string; // present when editing an existing sample (AC 12 — ID never changes)
  typeId: string;
  description: string;
  customerSampleRef: string;
  quantity: string;
  quantityUnit: string;
  requestedMethodIds: string[];
  condition: "conforming" | "deviation";
  deviationType: DeviationType;
  deviationNote: string;
  storageLocation: string;
};

let seq = 1;
const newKey = () => `s-${seq++}`;

function blankSample(): SampleRow {
  return {
    key: newKey(),
    typeId: "",
    description: "",
    customerSampleRef: "",
    quantity: "",
    quantityUnit: "",
    requestedMethodIds: [],
    condition: "conforming",
    deviationType: "none",
    deviationNote: "",
    storageLocation: "",
  };
}

export type JobFormInitial = {
  customer: string;
  customerRef: string;
  receivedAt: string;
  jobMethods: string[];
  priority: string;
  dueDate: string;
  notes: string;
  storageLocation: string;
  samples: SampleRow[];
};

// Jobs are ORGANISATION-wide (13 Jul 2026): the form has no lab — every active
// method of the organisation can be requested, and each method routes its work
// to the method's own lab (execution happens in lab-scoped batches).
export function JobForm({
  jobLabel,
  methods,
  sampleTypes,
  preview,
  mode = "create",
  jobId,
  jobNumber,
  initial,
}: {
  jobLabel: string;
  methods: MethodOption[];
  sampleTypes: TypeOption[];
  /** Example next number (create mode) — the real one is fixed on save. */
  preview?: string;
  mode?: "create" | "edit";
  jobId?: string;
  jobNumber?: string;
  initial?: JobFormInitial;
}) {
  const isEdit = mode === "edit";
  const [state, submit, pending] = useActionState(
    isEdit ? updateJobAction : createJobAction,
    initialState,
  );
  const [jobMethods, setJobMethods] = useState<string[]>(initial?.jobMethods ?? []);
  const [samples, setSamples] = useState<SampleRow[]>(
    initial?.samples?.length ? initial.samples : [blankSample()],
  );

  const patchSample = (key: string, patch: Partial<SampleRow>) =>
    setSamples((rows) => rows.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const toggleSampleMethod = (key: string, id: string) =>
    setSamples((rows) =>
      rows.map((s) =>
        s.key === key
          ? {
              ...s,
              requestedMethodIds: s.requestedMethodIds.includes(id)
                ? s.requestedMethodIds.filter((m) => m !== id)
                : [...s.requestedMethodIds, id],
            }
          : s,
      ),
    );

  const samplesJson = JSON.stringify(
    samples.map((s) => ({
      id: s.id,
      typeId: s.typeId,
      description: s.description,
      customerSampleRef: s.customerSampleRef,
      quantity: s.quantity,
      quantityUnit: s.quantityUnit,
      requestedMethodIds: s.requestedMethodIds.length > 0 ? s.requestedMethodIds : jobMethods,
      condition: s.condition,
      deviationType: s.deviationType,
      deviationNote: s.deviationNote,
      storageLocation: s.storageLocation,
    })),
  );

  return (
    <form action={submit} className="space-y-6">
      {isEdit && <input type="hidden" name="jobId" value={jobId} />}
      <input type="hidden" name="samplesJson" value={samplesJson} />

      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        {jobLabel} number:{" "}
        <span className="font-mono">
          {isEdit ? jobNumber : preview || "assigned on registration"}
        </span>{" "}
        {!isEdit && (
          <span className="text-muted-foreground">— example; the final number is fixed on save.</span>
        )}
        {isEdit && <span className="text-muted-foreground">— fixed; never reissued.</span>}
      </div>

      {/* Fresh orgs start with NO sample types (13 Jul 2026) — without this
          notice the type dropdowns are silently empty and the save fails. */}
      {sampleTypes.length === 0 && (
        <Alert>
          <AlertDescription>
            No sample types are configured yet — every sample needs one. Add them under
            Admin ▸ Settings ▸ Sample types first.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="customer">Customer</Label>
          <Input id="customer" name="customer" defaultValue={initial?.customer} required autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customerRef">Customer reference (optional)</Label>
          <Input id="customerRef" name="customerRef" defaultValue={initial?.customerRef} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="receivedAt">Received (date &amp; time)</Label>
          <DateTimeInput id="receivedAt" name="receivedAt" defaultValue={initial?.receivedAt} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Select name="priority" defaultValue={initial?.priority ?? "Standard"}>
            <SelectTrigger id="priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Standard">Standard</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dueDate">Due date (optional)</Label>
          <DateInput id="dueDate" name="dueDate" defaultValue={initial?.dueDate} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Requested methods (default for all samples)</Label>
        {methods.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active methods yet.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {methods.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  name="requestedMethodIds"
                  value={m.id}
                  checked={jobMethods.includes(m.id)}
                  onCheckedChange={() =>
                    setJobMethods((cur) =>
                      cur.includes(m.id) ? cur.filter((x) => x !== m.id) : [...cur, m.id],
                    )
                  }
                />
                {m.label}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="storageLocation">Storage location (optional)</Label>
        <Input
          id="storageLocation"
          name="storageLocation"
          defaultValue={initial?.storageLocation}
          className="max-w-sm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" defaultValue={initial?.notes} />
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">Samples</legend>
        {samples.map((s, i) => (
          <div key={s.key} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Sample {i + 1}
                {s.id && <span className="ml-2 font-mono text-xs text-muted-foreground">{s.id}</span>}
              </span>
              {samples.length > 1 && !s.id && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove sample"
                  onClick={() => setSamples((rows) => rows.filter((r) => r.key !== s.key))}
                >
                  <X />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={s.typeId} onValueChange={(v) => v && patchSample(s.key, { typeId: v })}>
                  <SelectTrigger aria-label="Sample type">
                    <SelectValue placeholder="Choose a type" />
                  </SelectTrigger>
                  <SelectContent>
                    {sampleTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Description / matrix</Label>
                <Input
                  value={s.description}
                  onChange={(e) => patchSample(s.key, { description: e.target.value })}
                  placeholder="e.g. Inlet"
                />
              </div>
              <div className="space-y-1">
                <Label>Customer sample ref (optional)</Label>
                <Input
                  value={s.customerSampleRef}
                  onChange={(e) => patchSample(s.key, { customerSampleRef: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <div className="space-y-1">
                  <Label>Quantity (optional)</Label>
                  <Input
                    value={s.quantity}
                    onChange={(e) => patchSample(s.key, { quantity: e.target.value })}
                    className="w-28"
                    placeholder="1.5"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Unit</Label>
                  <Input
                    value={s.quantityUnit}
                    onChange={(e) => patchSample(s.key, { quantityUnit: e.target.value })}
                    className="w-24"
                    placeholder="L"
                  />
                </div>
              </div>
            </div>

            {methods.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Requested methods (leave empty to use the job&apos;s default)
                </Label>
                <div className="flex flex-wrap gap-3">
                  {methods.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={s.requestedMethodIds.includes(m.id)}
                        onCheckedChange={() => toggleSampleMethod(s.key, m.id)}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={s.condition === "deviation"}
                  onCheckedChange={(checked) =>
                    patchSample(s.key, {
                      condition: checked ? "deviation" : "conforming",
                      deviationType: checked ? "cosmetic" : "none",
                    })
                  }
                />
                Deviation on receipt (§7.4)
              </label>
              {s.condition === "deviation" && (
                <div className="ml-6 space-y-2">
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`dev-${s.key}`}
                        checked={s.deviationType === "cosmetic"}
                        onChange={() => patchSample(s.key, { deviationType: "cosmetic" })}
                      />
                      Cosmetic (lab may accept)
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`dev-${s.key}`}
                        checked={s.deviationType === "mismatch"}
                        onChange={() => patchSample(s.key, { deviationType: "mismatch" })}
                      />
                      Does not match description / suitability in doubt
                    </label>
                  </div>
                  <Input
                    value={s.deviationNote}
                    onChange={(e) => patchSample(s.key, { deviationNote: e.target.value })}
                    placeholder="Deviation note"
                  />
                  {s.deviationType === "mismatch" && (
                    <p className="text-xs text-muted-foreground">
                      A customer consultation will be required before this sample can be accepted.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setSamples((r) => [...r, blankSample()])}>
          + Add sample
        </Button>
      </fieldset>

      {!isEdit && (
        <p className="text-xs text-muted-foreground">
          Acceptance decisions (§7.4.3) are recorded per sample on the {jobLabel.toLowerCase()} page
          after registration.
        </p>
      )}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.success && (
        <Alert>
          <AlertDescription>Saved.</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : isEdit ? "Save changes" : `Register ${jobLabel.toLowerCase()}`}
      </Button>
    </form>
  );
}

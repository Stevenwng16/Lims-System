"use client";

import { useState } from "react";
import { useActionState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { MethodAnalyte } from "@/lib/mock-db";
import { createMethodAction, updateMethodAction, type MethodFormState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

const initialState: MethodFormState = {};

type StepRow = { id: string; name: string; requiredEquipmentTypes: string[] };
type LabOption = { id: string; name: string };
type EquipmentTypeOption = { id: string; name: string; status: "active" | "inactive" };

type Props = {
  methodId?: string; // absent = create
  labs: LabOption[];
  // The org's equipment-type list (US-B3) — per-step requirements drive the
  // step-completion equipment gating (US-B1 AC 8 / US-D3 AC 4).
  equipmentTypes: EquipmentTypeOption[];
  readOnly: boolean;
  usedByBatches: boolean;
  initial: {
    name: string;
    code: string;
    labId: string;
    description: string;
    accredited: boolean;
    maxSamplesPerBatch: number;
    steps: StepRow[];
    analytes: MethodAnalyte[];
  };
};

// Collision-proof: a module counter would reset on page load and collide with
// persisted ids, cross-wiring rows and the server-side hook preservation
// (audit finding). Only called from client event handlers.
function localId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function MethodForm({ methodId, labs, equipmentTypes, readOnly, usedByBatches, initial }: Props) {
  const action = methodId ? updateMethodAction : createMethodAction;
  const [state, submit, pending] = useActionState(action, initialState);
  const [steps, setSteps] = useState<StepRow[]>(initial.steps);
  const [analytes, setAnalytes] = useState<MethodAnalyte[]>(initial.analytes);

  const moveStep = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    setSteps(next);
  };

  const patchAnalyte = (id: string, patch: Partial<MethodAnalyte>) => {
    setAnalytes((rows) => rows.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  return (
    <form action={submit} className="space-y-6">
      {methodId && <input type="hidden" name="methodId" value={methodId} />}
      <input type="hidden" name="stepsJson" value={JSON.stringify(steps)} />
      <input type="hidden" name="analytesJson" value={JSON.stringify(analytes)} />

      {usedByBatches && !readOnly && (
        <Alert>
          <AlertDescription>
            This method has been used by batches — saving your changes creates a new method
            version. Existing batches keep the version they ran under.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={initial.name} required disabled={readOnly} />
        </div>
        <div className="flex gap-4">
          <div className="space-y-2">
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              name="code"
              defaultValue={initial.code}
              required
              maxLength={12}
              className="w-32 font-mono uppercase"
              disabled={readOnly}
            />
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="labId">Lab</Label>
            <Select name="labId" defaultValue={initial.labId} disabled={readOnly}>
              <SelectTrigger id="labId">
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
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={initial.description}
          disabled={readOnly}
        />
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="accredited" defaultChecked={initial.accredited} disabled={readOnly} />
          Accredited method (drives report marking, epic F)
        </label>
        <div className="flex items-center gap-2">
          <Label htmlFor="maxSamplesPerBatch">Max samples per batch</Label>
          <Input
            id="maxSamplesPerBatch"
            name="maxSamplesPerBatch"
            type="number"
            min={1}
            defaultValue={initial.maxSamplesPerBatch}
            className="w-24"
            disabled={readOnly}
          />
          <span className="text-xs text-muted-foreground">(positions incl. QC)</span>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Process steps (ordered — drives the batch workflow)</legend>
        {steps.map((step, i) => (
          <div key={step.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-6 text-right text-sm tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              <Input
                value={step.name}
                onChange={(e) =>
                  setSteps((rows) => rows.map((s) => (s.id === step.id ? { ...s, name: e.target.value } : s)))
                }
                className="w-64"
                disabled={readOnly}
                aria-label={`Step ${i + 1} name`}
              />
              {!readOnly && (
                <>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="Move step up" onClick={() => moveStep(i, -1)} disabled={i === 0}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="Move step down" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}>
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove step" onClick={() => setSteps((rows) => rows.filter((s) => s.id !== step.id))}>
                    <X />
                  </Button>
                </>
              )}
            </div>
            {/* US-B1 AC 8 / US-D3 AC 4: completing a step with required types
                forces selecting the specific item used (Blocked never). Active
                types are offered; an inactive type a step already holds stays
                visible (grandfathered) until unchecked. */}
            {equipmentTypes.length > 0 && (
              <div className="ml-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Requires equipment:</span>
                {equipmentTypes
                  .filter((t) => t.status === "active" || step.requiredEquipmentTypes.includes(t.id))
                  .map((t) => (
                    <label key={t.id} className="flex items-center gap-1.5">
                      <Checkbox
                        checked={step.requiredEquipmentTypes.includes(t.id)}
                        disabled={readOnly}
                        onCheckedChange={(c) =>
                          setSteps((rows) =>
                            rows.map((s) =>
                              s.id === step.id
                                ? {
                                    ...s,
                                    requiredEquipmentTypes:
                                      c === true
                                        ? [...s.requiredEquipmentTypes, t.id]
                                        : s.requiredEquipmentTypes.filter((id) => id !== t.id),
                                  }
                                : s,
                            ),
                          )
                        }
                      />
                      {t.name}
                      {t.status === "inactive" && " (inactive)"}
                    </label>
                  ))}
              </div>
            )}
          </div>
        ))}
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setSteps((rows) => [...rows, { id: localId("s"), name: "", requiredEquipmentTypes: [] }])
            }
          >
            + Add step
          </Button>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Analytes / parameters</legend>
        <div className="space-y-2">
          {analytes.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2">
              <Input
                value={a.name}
                onChange={(e) => patchAnalyte(a.id, { name: e.target.value })}
                placeholder="Name (e.g. Pb)"
                className="w-40"
                disabled={readOnly}
                aria-label="Analyte name"
              />
              <Input
                value={a.unit ?? ""}
                onChange={(e) => patchAnalyte(a.id, { unit: e.target.value })}
                placeholder="Unit (e.g. mg/L)"
                className="w-28"
                disabled={readOnly || a.unit === null}
                aria-label="Analyte unit"
              />
              <label className="flex items-center gap-1 text-xs">
                <Checkbox
                  checked={a.unit === null}
                  onCheckedChange={(checked) => patchAnalyte(a.id, { unit: checked ? null : "" })}
                  disabled={readOnly}
                />
                no unit
              </label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={6}
                  value={a.decimals}
                  onChange={(e) => patchAnalyte(a.id, { decimals: Number(e.target.value) })}
                  className="w-16"
                  disabled={readOnly}
                  aria-label="Reporting precision (decimals)"
                />
                <span className="text-xs text-muted-foreground">dec.</span>
              </div>
              <Input
                value={a.loq ?? ""}
                onChange={(e) => patchAnalyte(a.id, { loq: e.target.value === "" ? null : e.target.value })}
                placeholder="LOQ (opt.)"
                className="w-28"
                disabled={readOnly}
                aria-label="Reporting limit (LOQ)"
              />
              {!readOnly && (
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove analyte" onClick={() => setAnalytes((rows) => rows.filter((row) => row.id !== a.id))}>
                  <X />
                </Button>
              )}
            </div>
          ))}
        </div>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setAnalytes((rows) => [
                ...rows,
                { id: localId("a"), name: "", unit: "", decimals: 2, loq: null },
              ])
            }
          >
            + Add analyte
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Reporting precision is per analyte; the rounding rule itself is fixed system-wide
          (round half up). LOQ uses a decimal point, e.g. 0.010.
        </p>
      </fieldset>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.success && (
        <Alert>
          <AlertDescription>
            Saved{state.newVersion ? ` — new version ${state.newVersion} created` : ""}.
          </AlertDescription>
        </Alert>
      )}

      {!readOnly && (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : methodId ? "Save method" : "Create method"}
        </Button>
      )}
    </form>
  );
}

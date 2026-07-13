"use client";

import { useState } from "react";
import { useActionState } from "react";
import type { ListItem, OrgSettings } from "@/lib/mock-db";
import { previewIds } from "@/lib/settings/format-id";
import {
  saveBarcodeAction,
  saveEquipmentSettingsAction,
  saveIdentifiersAction,
  saveLabSettingsAction,
  saveListAction,
  saveSecurityAction,
  type SettingsFormState,
} from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const initialState: SettingsFormState = {};

function SaveRow({ pending, state }: { pending: boolean; state: SettingsFormState }) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {state.success && <span className="text-xs text-muted-foreground">Saved.</span>}
      {state.error && (
        <Alert variant="destructive" className="flex-1">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function SecuritySection({ security }: { security: OrgSettings["security"] }) {
  const [state, submit, pending] = useActionState(saveSecurityAction, initialState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
        <CardDescription>Organisation-wide; enforced at login and password change.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="minPasswordLength">Minimum password length</Label>
              <Input
                id="minPasswordLength"
                name="minPasswordLength"
                type="number"
                min={8}
                max={128}
                defaultValue={security.minPasswordLength}
                className="w-24"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lockoutThreshold">Lockout after failed attempts</Label>
              <Input
                id="lockoutThreshold"
                name="lockoutThreshold"
                type="number"
                min={3}
                max={10}
                defaultValue={security.lockoutThreshold}
                className="w-24"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sessionTimeoutMinutes">Session timeout (minutes)</Label>
              <Input
                id="sessionTimeoutMinutes"
                name="sessionTimeoutMinutes"
                type="number"
                min={5}
                max={480}
                defaultValue={security.sessionTimeoutMinutes}
                className="w-24"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="requireComplexity" defaultChecked={security.requireComplexity} />
            Require password complexity (mixed character classes)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="requireMfa" defaultChecked={security.requireMfa} />
            Require MFA for all users of this organisation
          </label>
          <SaveRow pending={pending} state={state} />
        </form>
      </CardContent>
    </Card>
  );
}

function IdentifiersSection({
  identifiers,
  jobLabel,
  previewLabCode,
}: {
  identifiers: OrgSettings["identifiers"];
  jobLabel: string;
  previewLabCode: string;
}) {
  const [state, submit, pending] = useActionState(saveIdentifiersAction, initialState);
  const [formats, setFormats] = useState(identifiers);
  const preview = previewIds(formats, previewLabCode);

  const field = (
    key: "jobFormat" | "sampleFormat" | "batchFormat",
    label: string,
    example: string,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        name={key}
        defaultValue={identifiers[key]}
        onChange={(e) => setFormats((f) => ({ ...f, [key]: e.target.value }))}
        className="font-mono"
      />
      <p className="text-xs text-muted-foreground">
        Preview: <span className="font-mono">{example}</span>
      </p>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identifiers &amp; labels</CardTitle>
        <CardDescription>
          Tokens: {"{YY} {YYYY} {MM} {SEQ:000}"}; sample numbers use {"{JOB}"} (required) and batch
          numbers {"{LAB}"} (required — batch sequences run per lab). Jobs are organisation-wide,
          so {"{LAB}"} is not available for job or sample numbers. Format changes affect newly
          generated IDs only; issued IDs are never altered.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="space-y-4">
          {field("jobFormat", "Job number format", preview.job)}
          {field("sampleFormat", "Sample number format", preview.sample)}
          {field("batchFormat", "Batch number format", preview.batch)}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Sequence reset</legend>
            <div className="flex gap-6 text-sm">
              {(["never", "yearly", "monthly"] as const).map((opt) => (
                <label key={opt} className="flex items-center gap-2 capitalize">
                  <input
                    type="radio"
                    name="sequenceReset"
                    value={opt}
                    defaultChecked={identifiers.sequenceReset === opt}
                  />
                  {opt}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Job sequences count per organisation, batch sequences per lab, and sample sequences
              restart per job — organisations never share a counter.
            </p>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="jobLabel">Label for &quot;job&quot; (shown across the UI)</Label>
            <Input id="jobLabel" name="jobLabel" defaultValue={jobLabel} className="w-48" />
          </div>
          <SaveRow pending={pending} state={state} />
        </form>
      </CardContent>
    </Card>
  );
}

function ListSection({
  list,
  title,
  description,
  items,
}: {
  list: "sampleTypes" | "resultQualifiers";
  title: string;
  description: string;
  items: ListItem[];
}) {
  const [state, submit, pending] = useActionState(saveListAction, initialState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="space-y-3">
          <input type="hidden" name="list" value={list} />
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <input type="hidden" name="itemId" value={item.id} />
              <Input name={`name-${item.id}`} defaultValue={item.name} className="w-56" />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name={`active-${item.id}`} defaultChecked={item.active} />
                Active
              </label>
              {!item.active && <Badge variant="secondary">inactive</Badge>}
            </div>
          ))}
          <div className="flex items-center gap-3">
            <Input name="newName" placeholder="Add new…" className="w-56" />
          </div>
          <p className="text-xs text-muted-foreground">
            Entries are deactivated, never deleted — historical records keep their value.
          </p>
          <SaveRow pending={pending} state={state} />
        </form>
      </CardContent>
    </Card>
  );
}

function BarcodeSection({ barcode }: { barcode: OrgSettings["barcode"] }) {
  const [state, submit, pending] = useActionState(saveBarcodeAction, initialState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Barcode labels</CardTitle>
        <CardDescription>Used when printing sample labels.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Symbology</Label>
              <Input value="Code 128" readOnly className="w-40 bg-muted" />
              <p className="text-xs text-muted-foreground">QR / DataMatrix — later.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="widthMm">Width (mm)</Label>
              <Input id="widthMm" name="widthMm" type="number" min={20} max={150} defaultValue={barcode.widthMm} className="w-24" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="heightMm">Height (mm)</Label>
              <Input id="heightMm" name="heightMm" type="number" min={10} max={100} defaultValue={barcode.heightMm} className="w-24" />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Label fields</legend>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked disabled />
              Sample ID (human-readable — always printed)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="showCustomer" defaultChecked={barcode.showCustomer} />
              Customer
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="showSampleType" defaultChecked={barcode.showSampleType} />
              Sample type
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="showJobNumber" defaultChecked={barcode.showJobNumber} />
              Standalone job number
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="showDate" defaultChecked={barcode.showDate} />
              Receipt date
            </label>
          </fieldset>
          <SaveRow pending={pending} state={state} />
        </form>
      </CardContent>
    </Card>
  );
}

function EquipmentSection({ equipment }: { equipment: OrgSettings["equipment"] }) {
  const [state, submit, pending] = useActionState(saveEquipmentSettingsAction, initialState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipment</CardTitle>
        <CardDescription>
          Calibration due dates inside this window show as &quot;Due soon&quot; — a warning, not a
          block.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="calibrationWarningDays">Calibration warning window (days)</Label>
            <Input
              id="calibrationWarningDays"
              name="calibrationWarningDays"
              type="number"
              min={1}
              max={365}
              defaultValue={equipment.calibrationWarningDays}
              className="w-24"
            />
          </div>
          <SaveRow pending={pending} state={state} />
        </form>
      </CardContent>
    </Card>
  );
}

type LabSettingsRow = {
  id: string;
  name: string;
  analystsMayCreateBatches: boolean;
  reviewerMustDiffer: boolean;
};

// The form + its action state live in a keyed child, so switching labs resets
// the "Saved." / error message along with the checkboxes (audit finding 30).
function LabSettingsForm({ lab }: { lab: LabSettingsRow }) {
  const [state, submit, pending] = useActionState(saveLabSettingsAction, initialState);
  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="labId" value={lab.id} />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="analystsMayCreateBatches" defaultChecked={lab.analystsMayCreateBatches} />
        Analysts may create batches (cleared methods only)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="reviewerMustDiffer" defaultChecked={lab.reviewerMustDiffer} />
        Reviewer must differ from the performing analyst(s)
      </label>
      <SaveRow pending={pending} state={state} />
    </form>
  );
}

function LabSettingsSection({ labs }: { labs: LabSettingsRow[] }) {
  const [selectedId, setSelectedId] = useState(labs[0]?.id ?? "");
  const selected = labs.find((lab) => lab.id === selectedId);

  if (!selected) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lab settings</CardTitle>
        <CardDescription>Per-lab workflow options; take effect immediately.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-2">
          <Label htmlFor="lab-select">Lab</Label>
          <Select value={selectedId} onValueChange={(v) => v && setSelectedId(v)}>
            <SelectTrigger id="lab-select" className="w-56">
              <SelectValue />
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
        <LabSettingsForm key={selected.id} lab={selected} />
      </CardContent>
    </Card>
  );
}

export function SettingsClient({
  settings,
  labs,
  previewLabCode,
}: {
  settings: Pick<
    OrgSettings,
    | "security"
    | "identifiers"
    | "jobLabel"
    | "sampleTypes"
    | "resultQualifiers"
    | "barcode"
    | "equipment"
  >;
  labs: LabSettingsRow[];
  /** Real lab code the identifier previews render with (viewer's active lab). */
  previewLabCode: string;
}) {
  return (
    <div className="space-y-6">
      <SecuritySection security={settings.security} />
      <IdentifiersSection
        identifiers={settings.identifiers}
        jobLabel={settings.jobLabel}
        previewLabCode={previewLabCode}
      />
      <ListSection
        list="sampleTypes"
        title="Sample types"
        description="Used at sample registration."
        items={settings.sampleTypes}
      />
      <ListSection
        list="resultQualifiers"
        title="Result qualifiers"
        description="Extra qualifiers available at result entry beyond the fixed < and >."
        items={settings.resultQualifiers}
      />
      <BarcodeSection barcode={settings.barcode} />
      <EquipmentSection equipment={settings.equipment} />
      <LabSettingsSection labs={labs} />
    </div>
  );
}

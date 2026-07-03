"use client";

import { useState } from "react";
import { useActionState } from "react";
import type { ListItem, OrgSettings } from "@/lib/mock-db";
import { previewIds } from "@/lib/settings/format-id";
import {
  saveBarcodeAction,
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
}: {
  identifiers: OrgSettings["identifiers"];
  jobLabel: string;
}) {
  const [state, submit, pending] = useActionState(saveIdentifiersAction, initialState);
  const [formats, setFormats] = useState(identifiers);
  const preview = previewIds(formats);

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
          Tokens: {"{LAB} {YY} {YYYY} {MM} {SEQ:000}"} — sample numbers may also use {"{JOB}"}.
          Format changes affect newly generated IDs only; issued IDs are never altered.
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
              Sequences count per lab and per organisation — labs never share a counter.
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
        <CardDescription>Used when printing sample labels (US-C4).</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="symbology">Symbology</Label>
              <Select name="symbology" defaultValue={barcode.symbology}>
                <SelectTrigger id="symbology" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="code128">Code 128</SelectItem>
                  <SelectItem value="qr">QR</SelectItem>
                </SelectContent>
              </Select>
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
              <Checkbox name="showJobNumber" defaultChecked={barcode.showJobNumber} />
              Job number
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="showClient" defaultChecked={barcode.showClient} />
              Client
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="showDate" defaultChecked={barcode.showDate} />
              Registration date
            </label>
          </fieldset>
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

function LabSettingsSection({ labs }: { labs: LabSettingsRow[] }) {
  const [state, submit, pending] = useActionState(saveLabSettingsAction, initialState);
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
        <form action={submit} className="space-y-3" key={selected.id}>
          <input type="hidden" name="labId" value={selected.id} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              name="analystsMayCreateBatches"
              defaultChecked={selected.analystsMayCreateBatches}
            />
            Analysts may create batches (cleared methods only)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="reviewerMustDiffer" defaultChecked={selected.reviewerMustDiffer} />
            Reviewer must differ from the performing analyst(s)
          </label>
          <SaveRow pending={pending} state={state} />
        </form>
      </CardContent>
    </Card>
  );
}

export function SettingsClient({
  settings,
  labs,
}: {
  settings: Pick<
    OrgSettings,
    "security" | "identifiers" | "jobLabel" | "sampleTypes" | "resultQualifiers" | "barcode"
  >;
  labs: LabSettingsRow[];
}) {
  return (
    <div className="space-y-6">
      <SecuritySection security={settings.security} />
      <IdentifiersSection identifiers={settings.identifiers} jobLabel={settings.jobLabel} />
      <ListSection
        list="sampleTypes"
        title="Sample types"
        description="Used at sample registration (US-C1)."
        items={settings.sampleTypes}
      />
      <ListSection
        list="resultQualifiers"
        title="Result qualifiers"
        description="Extra qualifiers available at result entry beyond the fixed < and > (US-D4)."
        items={settings.resultQualifiers}
      />
      <BarcodeSection barcode={settings.barcode} />
      <LabSettingsSection labs={labs} />
    </div>
  );
}

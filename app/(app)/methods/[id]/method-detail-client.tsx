"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import type { TemplateVersion } from "@/lib/mock-db";
import { replaceTemplateAction, setMethodStatusAction, type MethodFormState } from "../actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: MethodFormState = {};

export function MethodStatusForm({
  methodId,
  status,
}: {
  methodId: string;
  status: "active" | "inactive";
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<MethodFormState>(initialState);
  const [pending, startTransition] = useTransition();
  const deactivating = status === "active";
  // Close-on-success runs in the action callback, not an effect (the
  // set-state-in-effect lint rule; behaviour unchanged — 17 Jul 2026).
  const submit = (formData: FormData) => {
    startTransition(async () => {
      const result = await setMethodStatusAction(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={deactivating ? "destructive" : "default"} size="sm" />}>
        {deactivating ? "Deactivate" : "Reactivate"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{deactivating ? "Deactivate" : "Reactivate"} method</DialogTitle>
          <DialogDescription>
            {deactivating
              ? "The method can no longer be selected for new batches. Nothing is deleted: history, versions and clearance records stay intact."
              : "The method becomes selectable for new batches again."}{" "}
            A reason is required and recorded.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="methodId" value={methodId} />
          <input type="hidden" name="status" value={deactivating ? "inactive" : "active"} />
          <div className="space-y-2">
            <Label htmlFor="status-reason">Reason</Label>
            <Textarea id="status-reason" name="reason" required autoFocus />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            className="w-full"
            variant={deactivating ? "destructive" : "default"}
            disabled={pending}
          >
            {pending ? "Saving…" : deactivating ? "Deactivate method" : "Reactivate method"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TemplateSection({
  methodId,
  canManage,
  usedByBatches,
  currentTemplate,
  history,
}: {
  methodId: string;
  canManage: boolean;
  usedByBatches: boolean;
  currentTemplate: TemplateVersion | null;
  history: TemplateVersion[];
}) {
  const [state, submit, pending] = useActionState(replaceTemplateAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data-entry template</CardTitle>
        <CardDescription>
          Stored via the central attachment facility: every version is immutable and carries a
          SHA-256 checksum, so it is provable which template a batch was calculated with.
          {usedByBatches && " Replacing the template on this method creates a new method version."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentTemplate ? (
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">
              {currentTemplate.fileName} · v{currentTemplate.version}
              {currentTemplate.hasResultsSheet && (
                <span className="ml-2 text-xs text-muted-foreground">includes Results sheet</span>
              )}
            </p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              SHA-256: {currentTemplate.sha256}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Uploaded {currentTemplate.uploadedAt} by {currentTemplate.uploadedBy} ·{" "}
              {(currentTemplate.sizeBytes / 1024).toFixed(1)} kB
            </p>
          </div>
        ) : (
          <Alert>
            <AlertDescription>
              No template uploaded yet — batches cannot be created for this method until one
              exists (epic D).
            </AlertDescription>
          </Alert>
        )}

        {canManage && (
          <form action={submit} className="space-y-3">
            <input type="hidden" name="methodId" value={methodId} />
            <div className="space-y-2">
              <Label htmlFor="templateFile">
                {currentTemplate ? "Replace template (new version)" : "Upload template"}
              </Label>
              <Input id="templateFile" name="templateFile" type="file" accept=".xlsx,.xls,.csv" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="hasResultsSheet" defaultChecked={currentTemplate?.hasResultsSheet} />
              Template includes the standard Results sheet (enables auto-read at worksheet upload)
            </label>
            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            {state.success && (
              <Alert>
                <AlertDescription>
                  Template uploaded{state.newVersion ? ` — method version ${state.newVersion} created` : ""}.
                </AlertDescription>
              </Alert>
            )}
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </form>
        )}

        {history.length > 1 && (
          <div>
            <p className="mb-2 text-sm font-medium">Version history</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {[...history].reverse().map((t) => (
                <li key={t.version} className="font-mono">
                  v{t.version} · {t.fileName} · {t.uploadedAt} · sha256 {t.sha256.slice(0, 16)}…
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

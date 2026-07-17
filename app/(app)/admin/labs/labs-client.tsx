"use client";

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import type { LabSummary } from "@/lib/labs";
import { createLabAction, updateLabAction, type LabFormState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const initialState: LabFormState = {};

function NewLabDialog() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LabFormState>(initialState);
  const [pending, startTransition] = useTransition();
  // Close-on-success runs in the action callback, not an effect (the
  // set-state-in-effect lint rule; behaviour unchanged — 17 Jul 2026).
  const submit = (formData: FormData) => {
    startTransition(async () => {
      const result = await createLabAction(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>+ New lab</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New lab</DialogTitle>
          <DialogDescription>
            The short code is used in job and batch identifiers and must be unique within your
            organisation.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-name">Name</Label>
            <Input id="new-name" name="name" required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-code">Code</Label>
            <Input id="new-code" name="code" required maxLength={8} className="w-32 uppercase" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-description">Description / location (optional)</Label>
            <Textarea id="new-description" name="description" />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create lab"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditLabDialog({ lab, onClose }: { lab: LabSummary; onClose: () => void }) {
  const [state, submit, pending] = useActionState(updateLabAction, initialState);
  const [status, setStatus] = useState<"active" | "inactive">(lab.status);
  const statusChanged = status !== lab.status;

  useEffect(() => {
    if (state.success) onClose();
  }, [state, onClose]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit lab — {lab.name}</DialogTitle>
          <DialogDescription>
            Changing the code never rewrites identifiers that were already issued with the old
            code — those stay as issued, for traceability.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="labId" value={lab.id} />
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" name="name" defaultValue={lab.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-code">Code</Label>
            <Input
              id="edit-code"
              name="code"
              defaultValue={lab.code}
              required
              maxLength={8}
              className="w-32 uppercase"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description / location</Label>
            <Textarea id="edit-description" name="description" defaultValue={lab.description} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Status</legend>
            <div className="flex gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="status"
                  value="active"
                  checked={status === "active"}
                  onChange={() => setStatus("active")}
                />
                Active
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="status"
                  value="inactive"
                  checked={status === "inactive"}
                  onChange={() => setStatus("inactive")}
                />
                Inactive
              </label>
            </div>
            {statusChanged && (
              <div className="space-y-2">
                <Label htmlFor="statusReason">
                  Reason for {status === "inactive" ? "deactivating" : "reactivating"} (required)
                </Label>
                <Textarea id="statusReason" name="statusReason" required autoFocus />
              </div>
            )}
            {lab.statusReason && !statusChanged && (
              <p className="text-xs text-muted-foreground">
                Last status change: {lab.statusReason}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Labs are deactivated, never deleted — historical data and links are always retained.
            </p>
          </fieldset>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LabsClient({ labs }: { labs: LabSummary[] }) {
  const [editing, setEditing] = useState<LabSummary | null>(null);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Labs</h1>
        <NewLabDialog />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead className="text-right">Users</TableHead>
              <TableHead className="text-right">Methods</TableHead>
              <TableHead className="text-right">Equipment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {labs.map((lab) => (
              <TableRow key={lab.id}>
                <TableCell className="font-medium">
                  {lab.name}
                  {lab.description && (
                    <span className="block text-xs text-muted-foreground">{lab.description}</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">{lab.code}</TableCell>
                <TableCell className="text-right tabular-nums">{lab.userCount}</TableCell>
                <TableCell className="text-right tabular-nums">{lab.methodCount}</TableCell>
                <TableCell className="text-right tabular-nums">{lab.equipmentCount}</TableCell>
                <TableCell>
                  {lab.status === "active" ? (
                    <Badge variant="outline">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="xs" onClick={() => setEditing(lab)}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && <EditLabDialog lab={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

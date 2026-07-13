"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import type { OrganisationSummary } from "@/lib/platform";
import {
  deactivateOrganisationAction,
  openSupportSessionAction,
  reactivateOrganisationAction,
  suspendOrganisationAction,
  type PlatformFormState,
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

const initialState: PlatformFormState = {};

function StatusBadge({ status }: { status: OrganisationSummary["status"] }) {
  if (status === "active") return <Badge variant="outline">active</Badge>;
  if (status === "suspended") return <Badge variant="destructive">suspended</Badge>;
  return <Badge variant="secondary">deactivated</Badge>;
}

function grantLabel(org: OrganisationSummary): string {
  if (!org.supportGrant) return "no grant";
  if (org.supportSessionActive) return "session active";
  const hoursLeft = Math.max(1, Math.ceil((org.supportGrant.expiresAt - Date.now()) / 3600_000));
  return `${hoursLeft}h left${org.supportGrant.allowAdmin ? " · admin" : ""}`;
}

type StatusMode = "suspend" | "reactivate" | "deactivate";

const MODE_COPY: Record<
  StatusMode,
  { action: typeof suspendOrganisationAction; title: string; body: string; cta: string; destructive: boolean }
> = {
  suspend: {
    action: suspendOrganisationAction,
    title: "Suspend",
    body: "Users of this organisation will no longer be able to log in. No data is altered or removed; reactivation restores access exactly as it was.",
    cta: "Suspend organisation",
    destructive: true,
  },
  reactivate: {
    action: reactivateOrganisationAction,
    title: "Reactivate",
    body: "Users of this organisation will be able to log in again.",
    cta: "Reactivate organisation",
    destructive: false,
  },
  deactivate: {
    action: deactivateOrganisationAction,
    // Deactivate, never delete (US-A2 AC 1): the org and all its data are
    // retained for traceability; it just leaves the active set and drops out
    // of the default console view. Reactivatable if it was a mistake.
    title: "Deactivate",
    body: "The organisation and all its data are retained (nothing is ever deleted), but it leaves the active list and its users can no longer log in. Any support grant is ended. You can reactivate it later.",
    cta: "Deactivate organisation",
    destructive: true,
  },
};

// Per-target dialog with its own action state (audit finding 29): fresh state
// per mount fixes stale-error leakage and the title flip; the functional-
// updater close guard fixes an in-flight result closing the wrong dialog.
function StatusDialog({
  org,
  mode,
  onClose,
  onSuccess,
}: {
  org: OrganisationSummary;
  mode: StatusMode;
  onClose: () => void;
  onSuccess: (orgId: string) => void;
}) {
  const copy = MODE_COPY[mode];
  const [state, submit, pending] = useActionState(copy.action, initialState);

  useEffect(() => {
    if (state.success) onSuccess(org.id);
  }, [state, org.id, onSuccess]);

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {copy.title} {org.name}
          </DialogTitle>
          <DialogDescription>{copy.body} A reason is required and recorded.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="orgId" value={org.id} />
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" name="reason" required autoFocus />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            className="w-full"
            variant={copy.destructive ? "destructive" : "default"}
            disabled={pending}
          >
            {pending ? "Saving…" : copy.cta}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OrganisationTable({ organisations }: { organisations: OrganisationSummary[] }) {
  // The dialog carries its target AND which status change it performs, so the
  // same component drives suspend / reactivate / deactivate.
  const [dialog, setDialog] = useState<{ org: OrganisationSummary; mode: StatusMode } | null>(null);
  const [sessionState, openSession, sessionPending] = useActionState(
    openSupportSessionAction,
    initialState,
  );
  // Deactivated organisations are hidden by default (same hidden-by-default
  // pattern as voided jobs / completed batches) — they are never deleted, just
  // out of the way; a toggle brings them back to reactivate.
  const [showDeactivated, setShowDeactivated] = useState(false);
  const deactivatedCount = organisations.filter((o) => o.status === "deactivated").length;
  const visible = organisations.filter((o) => showDeactivated || o.status !== "deactivated");

  return (
    <>
      {deactivatedCount > 0 && (
        <Label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Checkbox checked={showDeactivated} onCheckedChange={(c) => setShowDeactivated(c === true)} />
          Show deactivated ({deactivatedCount})
        </Label>
      )}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead className="text-right">Users</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Support</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((org) => (
              <TableRow key={org.id}>
                <TableCell className="font-medium">
                  {org.name}
                  {org.setupPending && (
                    <span className="ml-2 text-xs text-zinc-400">setup pending</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={org.status} />
                </TableCell>
                <TableCell>{org.subscription}</TableCell>
                <TableCell className="text-right tabular-nums">{org.userCount}</TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">{org.createdAt}</TableCell>
                <TableCell>
                  {org.supportGrant && !org.supportSessionActive ? (
                    <form action={openSession} className="flex items-center gap-2">
                      <input type="hidden" name="orgId" value={org.id} />
                      <span className="text-sm">{grantLabel(org)}</span>
                      <Button type="submit" variant="outline" size="xs" disabled={sessionPending}>
                        Open session
                      </Button>
                    </form>
                  ) : (
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      {grantLabel(org)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {/* active/suspended can be suspended-toggled and
                        deactivated; a deactivated org can only be reactivated. */}
                    {org.status === "active" && (
                      <Button variant="ghost" size="xs" onClick={() => setDialog({ org, mode: "suspend" })}>
                        Suspend
                      </Button>
                    )}
                    {org.status !== "active" && (
                      <Button variant="ghost" size="xs" onClick={() => setDialog({ org, mode: "reactivate" })}>
                        Reactivate
                      </Button>
                    )}
                    {org.status !== "deactivated" && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-destructive"
                        onClick={() => setDialog({ org, mode: "deactivate" })}
                      >
                        Deactivate
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {sessionState.error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{sessionState.error}</AlertDescription>
        </Alert>
      )}

      {dialog && (
        <StatusDialog
          key={`${dialog.org.id}:${dialog.mode}`}
          org={dialog.org}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onSuccess={(orgId) => setDialog((cur) => (cur?.org.id === orgId ? null : cur))}
        />
      )}
    </>
  );
}

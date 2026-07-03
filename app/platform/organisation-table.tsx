"use client";

import { useState } from "react";
import { useActionState } from "react";
import type { OrganisationSummary } from "@/lib/platform";
import {
  openSupportSessionAction,
  reactivateOrganisationAction,
  suspendOrganisationAction,
  type PlatformFormState,
} from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  if (org.supportGrant.sessionActive) return "session active";
  const hoursLeft = Math.max(1, Math.ceil((org.supportGrant.expiresAt - Date.now()) / 3600_000));
  return `${hoursLeft}h left${org.supportGrant.allowAdmin ? " · admin" : ""}`;
}

export function OrganisationTable({ organisations }: { organisations: OrganisationSummary[] }) {
  const [dialogOrg, setDialogOrg] = useState<OrganisationSummary | null>(null);
  const suspending = dialogOrg?.status === "active";

  const [state, submit, pending] = useActionState(
    async (prev: PlatformFormState, formData: FormData) => {
      const action = suspending ? suspendOrganisationAction : reactivateOrganisationAction;
      const result = await action(prev, formData);
      if (result.success) setDialogOrg(null);
      return result;
    },
    initialState,
  );
  const [sessionState, openSession, sessionPending] = useActionState(
    openSupportSessionAction,
    initialState,
  );

  return (
    <>
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
            {organisations.map((org) => (
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
                  {org.supportGrant && !org.supportGrant.sessionActive ? (
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
                  {org.status === "active" ? (
                    <Button variant="ghost" size="xs" onClick={() => setDialogOrg(org)}>
                      Suspend
                    </Button>
                  ) : (
                    <Button variant="ghost" size="xs" onClick={() => setDialogOrg(org)}>
                      Reactivate
                    </Button>
                  )}
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

      <Dialog open={!!dialogOrg} onOpenChange={(open) => !open && setDialogOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {suspending ? "Suspend" : "Reactivate"} {dialogOrg?.name}
            </DialogTitle>
            <DialogDescription>
              {suspending
                ? "Users of this organisation will no longer be able to log in. No data is altered or removed; reactivation restores access exactly as it was."
                : "Users of this organisation will be able to log in again."}{" "}
              A reason is required and recorded.
            </DialogDescription>
          </DialogHeader>
          <form action={submit} className="space-y-4">
            <input type="hidden" name="orgId" value={dialogOrg?.id ?? ""} />
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
              variant={suspending ? "destructive" : "default"}
              disabled={pending}
            >
              {pending ? "Saving…" : suspending ? "Suspend organisation" : "Reactivate organisation"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

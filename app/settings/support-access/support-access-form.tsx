"use client";

import { useActionState } from "react";
import {
  grantSupportAccessAction,
  revokeSupportAccessAction,
  type SupportAccessFormState,
} from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: SupportAccessFormState = {};

type GrantView = { expiresAt: number; allowAdmin: boolean; sessionActive: boolean } | null;

export function SupportAccessForm({ grant }: { grant: GrantView }) {
  const [grantState, grantAccess, grantPending] = useActionState(
    grantSupportAccessAction,
    initialState,
  );
  const [revokeState, revokeAccess, revokePending] = useActionState(
    revokeSupportAccessAction,
    initialState,
  );
  const state = grant ? revokeState : grantState;

  const hoursLeft = grant ? Math.max(1, Math.ceil((grant.expiresAt - Date.now()) / 3600_000)) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {grant ? "Support access is granted" : "No active grant"}
        </CardTitle>
        <CardDescription>
          By default, the vendor has no access to the inside of your organisation. You can grant
          time-limited support access and revoke it at any moment. Active sessions and every
          support action appear in your audit log.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {grant ? (
          <form action={revokeAccess} className="space-y-4">
            <div className="rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800">
              <p>
                Expires in <span className="font-medium tabular-nums">{hoursLeft} hours</span>
              </p>
              <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                Mode: {grant.allowAdmin ? "changes allowed (admin rights)" : "read-only"}
                {grant.sessionActive && " · a support session is active right now"}
              </p>
            </div>
            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" variant="destructive" disabled={revokePending}>
              {revokePending ? "Revoking…" : "Revoke access now"}
            </Button>
          </form>
        ) : (
          <form action={grantAccess} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration</Label>
              <Select name="duration" defaultValue="72">
                <SelectTrigger id="duration" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="72">72 hours (default)</SelectItem>
                  <SelectItem value="168">7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="allowAdmin" name="allowAdmin" />
              <Label htmlFor="allowAdmin" className="font-normal">
                Allow changes (admin rights) — otherwise read-only
              </Label>
            </div>
            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={grantPending}>
              {grantPending ? "Granting…" : "Grant access"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useActionState } from "react";
import { createFirstLabAction, type SetupFormState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SetupFormState = {};

// First-run setup form (13 Jul 2026 decision): asks for the REAL first lab
// instead of seeding a placeholder — the code becomes part of every job and
// batch identifier, permanently.
export function SetupForm({ organisationName }: { organisationName: string }) {
  const [state, submit, pending] = useActionState(createFirstLabAction, initialState);

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Welcome to {organisationName}</CardTitle>
        <CardDescription>
          Your organisation has no labs yet. Create your first lab to start working — everything
          in the system (users, methods, equipment, jobs, batches) is scoped to a lab.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="setup-name">Lab name</Label>
            <Input id="setup-name" name="name" placeholder="e.g. Metals lab" autoFocus required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-code">Short code (2–8 characters)</Label>
            <Input id="setup-code" name="code" placeholder="e.g. MET" className="w-32 font-mono uppercase" maxLength={8} required />
            <p className="text-xs text-muted-foreground">
              The code is stamped into every job and batch number (e.g. MET26-00001) and issued
              identifiers are never rewritten — choose the code you want in your records.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-desc">Description / location (optional)</Label>
            <Input id="setup-desc" name="description" placeholder="e.g. Metals analysis, ground floor" />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create lab & start"}
          </Button>
          <p className="text-xs text-muted-foreground">
            You will be assigned to this lab as its first member. Afterwards: add colleagues under
            Admin ▸ Users, more labs under Admin ▸ Labs, and methods under Methods.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

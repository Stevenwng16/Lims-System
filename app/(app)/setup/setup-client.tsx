"use client";

import { useActionState, useState } from "react";
import { PRODUCT_NAME } from "@/lib/branding";
import { renderTemplate } from "@/lib/settings/format-id";
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
export function SetupForm({
  organisationName,
  batchFormat,
}: {
  organisationName: string;
  batchFormat: string;
}) {
  const [state, submit, pending] = useActionState(createFirstLabAction, initialState);
  const [code, setCode] = useState("");

  // Live example under the code field: the org's real batch template (same
  // client-safe renderer as the Settings preview) with the code as typed, so
  // the admin sees exactly what their choice will stamp. Jobs are org-wide
  // (13 Jul 2026) — the lab code appears in BATCH numbers only.
  const now = new Date();
  const exampleBatch = renderTemplate(batchFormat, {
    lab: code.trim().toUpperCase() || "MET",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    seq: 1,
  });

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Welcome to {PRODUCT_NAME}</CardTitle>
        <CardDescription>
          {organisationName} has no labs yet. Create your first lab to start working — methods,
          equipment and batches live in a lab, and colleagues in lab-scoped roles are assigned to
          one. Jobs are organisation-wide: each requested method routes its work to the method&apos;s
          lab.
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
            <Input
              id="setup-code"
              name="code"
              placeholder="e.g. MET"
              className="w-32 font-mono uppercase"
              maxLength={8}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <p className="text-xs text-muted-foreground">
              The code is stamped into every batch number of this lab (e.g.{" "}
              <span className="font-mono">{exampleBatch}</span>) and issued identifiers are never
              rewritten — choose the code you want in your records.
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
            As an admin you have access to all labs of your organisation. Afterwards: add sample
            types under Admin ▸ Settings, colleagues under Admin ▸ Users, more labs under
            Admin ▸ Labs, and methods under Methods.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

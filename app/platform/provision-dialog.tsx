"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { provisionOrganisationAction, type PlatformFormState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

const initialState: PlatformFormState = {};

export function ProvisionDialog() {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(provisionOrganisationAction, initialState);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>+ New organisation</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Provision a new organisation</DialogTitle>
          <DialogDescription>
            Creates the organisation with seeded default settings and sends a time-limited setup
            invitation to its first administrator.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organisation name</Label>
            <Input id="name" name="name" required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adminEmail">First administrator&apos;s email</Label>
            <Input id="adminEmail" name="adminEmail" type="email" required />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Provisioning…" : "Provision organisation"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

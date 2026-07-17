"use client";

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import type { UserListItem } from "@/lib/users";
import type { OrgRole } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  createUserAction,
  sendPasswordResetAction,
  unlockAccountAction,
  updateUserAction,
  type UserFormState,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const initialState: UserFormState = {};

type ClearanceOption = { id: string; label: string };

type Props = {
  users: UserListItem[];
  assignableLabs: string[];
  methods: ClearanceOption[];
  methodLabels: Record<string, string>;
  actorRole: "admin" | "lab-manager";
  actorEmail: string;
};

function roleOptions(actorRole: Props["actorRole"]): OrgRole[] {
  // AC 10: lab managers can only assign Analyst or Read-only.
  return actorRole === "admin"
    ? ["admin", "lab-manager", "analyst", "read-only"]
    : ["analyst", "read-only"];
}

function UserFormFields({
  user,
  assignableLabs,
  methods,
  methodLabels,
  actorRole,
}: {
  user: UserListItem | null;
  assignableLabs: string[];
  methods: ClearanceOption[];
  methodLabels: Record<string, string>;
  actorRole: Props["actorRole"];
}) {
  const [role, setRole] = useState<OrgRole>(user?.role ?? "read-only");
  const prefix = user ? "edit" : "new";
  // Clearances the user holds that this form cannot edit (method inactive or
  // outside the actor's labs) — they survive saves untouched (US-B1 AC 12).
  const heldElsewhere = (user?.clearances ?? []).filter(
    (id) => !methods.some((m) => m.id === id),
  );

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-name`}>Full name</Label>
        <Input id={`${prefix}-name`} name="name" defaultValue={user?.name ?? ""} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-email`}>Email</Label>
        <Input
          id={`${prefix}-email`}
          name="email"
          type="email"
          defaultValue={user?.email ?? ""}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-role`}>Role</Label>
        <Select name="role" value={role} onValueChange={(v) => v && setRole(v as OrgRole)}>
          <SelectTrigger id={`${prefix}-role`} className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roleOptions(actorRole).map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Lab(s)</legend>
        <div className="flex flex-wrap gap-4">
          {assignableLabs.map((lab) => (
            <label key={lab} className="flex items-center gap-2 text-sm">
              <Checkbox name="labs" value={lab} defaultChecked={user?.labs.includes(lab)} />
              {lab}
            </label>
          ))}
        </div>
      </fieldset>
      {role === "analyst" && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Method clearances</legend>
          <p className="text-xs text-muted-foreground">
            An Analyst can only enter data and advance steps for methods they are cleared for.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {methods.map((method) => (
              <label key={method.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  name="clearances"
                  value={method.id}
                  defaultChecked={user?.clearances.includes(method.id)}
                />
                {method.label}
              </label>
            ))}
          </div>
          {heldElsewhere.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Also holds (kept for the audit trail, not editable here):{" "}
              {heldElsewhere.map((id) => methodLabels[id] ?? id).join(", ")}
            </p>
          )}
        </fieldset>
      )}
    </>
  );
}

function NewUserDialog(props: Omit<Props, "users" | "actorEmail">) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<UserFormState>(initialState);
  const [pending, startTransition] = useTransition();
  // Close-on-success runs in the action callback, not an effect (the
  // set-state-in-effect lint rule; behaviour unchanged — 17 Jul 2026).
  const submit = (formData: FormData) => {
    startTransition(async () => {
      const result = await createUserAction(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>+ New user</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>
            The user receives an email invitation to set their own password
            {" "}and enrol MFA if required — you never set or see it.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <UserFormFields user={null} {...props} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create user & send invitation"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  onClose,
  ...props
}: Omit<Props, "users" | "actorEmail"> & { user: UserListItem; onClose: () => void }) {
  const [state, submit, pending] = useActionState(updateUserAction, initialState);
  const [resetState, sendReset, resetPending] = useActionState(
    sendPasswordResetAction,
    initialState,
  );
  const [unlockState, unlock, unlockPending] = useActionState(unlockAccountAction, initialState);

  useEffect(() => {
    if (state.success) onClose();
  }, [state, onClose]);

  const info = resetState.info ?? unlockState.info;
  const error = state.error ?? resetState.error ?? unlockState.error;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit user — {user.name}</DialogTitle>
          <DialogDescription>
            Users are deactivated, never deleted — historical actions stay attributable.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="targetEmail" value={user.email} />
          <UserFormFields user={user} {...props} />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Status</legend>
            <div className="flex gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="status" value="active" defaultChecked={user.status === "active"} />
                Active
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="status"
                  value="inactive"
                  defaultChecked={user.status === "inactive"}
                />
                Inactive
              </label>
            </div>
          </fieldset>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {info && (
            <Alert>
              <AlertDescription>{info}</AlertDescription>
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
        <div className="flex gap-2 border-t pt-4">
          <form action={sendReset}>
            <input type="hidden" name="targetEmail" value={user.email} />
            <Button type="submit" variant="outline" size="sm" disabled={resetPending}>
              Send password reset
            </Button>
          </form>
          {user.locked && (
            <form action={unlock}>
              <input type="hidden" name="targetEmail" value={user.email} />
              <Button type="submit" variant="outline" size="sm" disabled={unlockPending}>
                Unlock account
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function UsersClient({
  users,
  assignableLabs,
  methods,
  methodLabels,
  actorRole,
  actorEmail,
}: Props) {
  // Track only the identity and derive the row from fresh props, so the open
  // dialog stays in sync with revalidated data — e.g. after Unlock the "locked"
  // badge and Unlock button disappear (audit finding 31).
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const editing = editingEmail ? (users.find((u) => u.email === editingEmail) ?? null) : null;

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Users</h1>
        <NewUserDialog
          assignableLabs={assignableLabs}
          methods={methods}
          methodLabels={methodLabels}
          actorRole={actorRole}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Lab(s)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.email}>
                <TableCell className="font-medium">
                  {user.name}
                  {user.email === actorEmail && (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  )}
                  {user.locked && (
                    <Badge variant="destructive" className="ml-2">
                      locked
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>{ROLE_LABELS[user.role]}</TableCell>
                <TableCell>{user.labs.join(", ")}</TableCell>
                <TableCell>
                  {user.status === "active" ? (
                    <Badge variant="outline">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{user.lastLogin ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="xs" onClick={() => setEditingEmail(user.email)}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <EditUserDialog
          key={`${editing.email}-${editing.locked}-${editing.status}`}
          user={editing}
          onClose={() => setEditingEmail(null)}
          assignableLabs={assignableLabs}
          methods={methods}
          methodLabels={methodLabels}
          actorRole={actorRole}
        />
      )}
    </>
  );
}

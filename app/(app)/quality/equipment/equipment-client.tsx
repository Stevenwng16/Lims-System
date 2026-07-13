"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { Availability, EquipmentListItem } from "@/lib/equipment";
import {
  createEquipmentAction,
  createTypeAction,
  renameTypeAction,
  setTypeStatusAction,
  type EquipmentFormState,
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
import { Textarea } from "@/components/ui/textarea";

const initialState: EquipmentFormState = {};

export type TypeOption = { id: string; name: string; status: "active" | "inactive" };
type LabOption = { id: string; name: string };

export function StateBadge({ availability }: { availability: Availability }) {
  if (availability.state === "blocked") {
    return <Badge variant="destructive">Blocked</Badge>;
  }
  if (availability.state === "due-soon") {
    return (
      <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
        Due soon
      </Badge>
    );
  }
  return (
    <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
      Available
    </Badge>
  );
}

function CalibrationCell({ item }: { item: EquipmentListItem }) {
  const { state, dueDate } = item.calibration;
  if (state === "none") return <span className="text-muted-foreground">—</span>;
  if (state === "expired") {
    return <span className="font-medium text-destructive">Expired {dueDate}</span>;
  }
  if (state === "due-soon") {
    return <span className="font-medium text-amber-700 dark:text-amber-400">Due {dueDate}</span>;
  }
  return <span>Valid →{dueDate}</span>;
}

function ChecksCell({ item }: { item: EquipmentListItem }) {
  const { state, label } = item.checks;
  if (state === "none") return <span className="text-muted-foreground">—</span>;
  if (state === "failed" || state === "overdue") {
    return <span className="font-medium text-destructive">{label}</span>;
  }
  if (state === "due-today") {
    return <span className="font-medium text-amber-700 dark:text-amber-400">{label}</span>;
  }
  return <span>{label}</span>;
}

// Create dialog (AC 2). Editing lives on the detail page.
export function EquipmentDialog({
  types,
  labs,
  canManageTypes,
  onManageTypes,
  onDone,
}: {
  types: TypeOption[];
  labs: LabOption[];
  /** Admin only — shows the jump to the type manager when no types exist. */
  canManageTypes: boolean;
  onManageTypes: () => void;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(createEquipmentAction, initialState);
  const activeTypes = types.filter((t) => t.status === "active");
  const [typeId, setTypeId] = useState(activeTypes[0]?.id ?? "");
  const [labId, setLabId] = useState(labs[0]?.id ?? "");
  const v = state.values; // echoed back on error to survive React 19's reset

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New equipment</DialogTitle>
          <DialogDescription>
            The equipment ID is unique within the organisation and stays with the asset for good.
            Calibration, routine checks and method links are added on the detail page afterwards.
          </DialogDescription>
        </DialogHeader>
        {/* Fresh orgs start with NO equipment types (13 Jul 2026) — without
            this branch the Type dropdown is silently empty and the save can
            never succeed. */}
        {activeTypes.length === 0 ? (
          <div className="space-y-3">
            <Alert>
              <AlertDescription>
                No equipment types are configured yet — every piece of equipment needs one.
                {!canManageTypes && " Ask an Admin to add them under Manage types."}
              </AlertDescription>
            </Alert>
            {canManageTypes && (
              <Button size="sm" variant="outline" onClick={onManageTypes}>
                Manage types
              </Button>
            )}
          </div>
        ) : (
        <form action={submit} className="space-y-4">
          <input type="hidden" name="typeId" value={typeId} />
          <input type="hidden" name="labId" value={labId} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="eq-name">Name</Label>
              <Input id="eq-name" name="name" defaultValue={v?.name ?? ""} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-asset">Equipment ID</Label>
              <Input
                id="eq-asset"
                name="assetId"
                defaultValue={v?.assetId ?? ""}
                required
                maxLength={32}
                placeholder="e.g. BAL-003"
                className="w-40 font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={typeId} onValueChange={(next) => next && setTypeId(next)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a type" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lab</Label>
              <Select value={labId} onValueChange={(next) => next && setLabId(next)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a lab" />
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
            <div className="space-y-2">
              <Label htmlFor="eq-manufacturer">Manufacturer (optional)</Label>
              <Input id="eq-manufacturer" name="manufacturer" defaultValue={v?.manufacturer ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-model">Model (optional)</Label>
              <Input id="eq-model" name="model" defaultValue={v?.model ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-serial">Serial number (optional)</Label>
              <Input id="eq-serial" name="serialNumber" defaultValue={v?.serialNumber ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-location">Location (optional)</Label>
              <Input id="eq-location" name="location" defaultValue={v?.location ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eq-desc">Description (optional)</Label>
            <Textarea id="eq-desc" name="description" defaultValue={v?.description ?? ""} />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Create equipment"}
          </Button>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// One row of the type manager: rename + retire/reactivate, each its own form.
function TypeRow({ type }: { type: TypeOption }) {
  const [renameState, renameSubmit, renamePending] = useActionState(renameTypeAction, initialState);
  const [statusState, statusSubmit, statusPending] = useActionState(setTypeStatusAction, initialState);
  const [showReason, setShowReason] = useState(false);
  const nextStatus = type.status === "active" ? "inactive" : "active";

  useEffect(() => {
    if (statusState.success) setShowReason(false);
  }, [statusState]);

  return (
    <div className="space-y-2 border-b pb-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <form action={renameSubmit} className="flex flex-1 items-center gap-2">
          <input type="hidden" name="typeId" value={type.id} />
          <Input name="name" defaultValue={type.name} className="w-48" aria-label={`Rename ${type.name}`} />
          <Button type="submit" size="xs" variant="outline" disabled={renamePending}>
            Rename
          </Button>
        </form>
        {type.status === "inactive" && <Badge variant="secondary">Inactive</Badge>}
        <Button type="button" size="xs" variant="ghost" onClick={() => setShowReason((s) => !s)}>
          {type.status === "active" ? "Deactivate…" : "Reactivate…"}
        </Button>
      </div>
      {showReason && (
        <form action={statusSubmit} className="flex items-center gap-2">
          <input type="hidden" name="typeId" value={type.id} />
          <input type="hidden" name="status" value={nextStatus} />
          <Input name="reason" placeholder="Reason (required)" className="flex-1" required />
          <Button type="submit" size="xs" variant="outline" disabled={statusPending}>
            Confirm
          </Button>
        </form>
      )}
      {(renameState.error || statusState.error) && (
        <Alert variant="destructive">
          <AlertDescription>{renameState.error ?? statusState.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// AC 2: the configurable type list — Admin only (authorization section).
function ManageTypesDialog({ types, onDone }: { types: TypeOption[]; onDone: () => void }) {
  const [createState, createSubmit, createPending] = useActionState(createTypeAction, initialState);

  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Equipment types</DialogTitle>
          <DialogDescription>
            Types are configurable per organisation and deactivated, never deleted — existing
            equipment keeps a deactivated type; it just stops being offered for new equipment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {types.map((t) => (
            <TypeRow key={t.id} type={t} />
          ))}
          <form action={createSubmit} className="flex items-center gap-2 pt-1">
            <Input
              name="name"
              placeholder="Add new type…"
              defaultValue={createState.values?.name ?? ""}
              className="w-48"
            />
            <Button type="submit" size="xs" variant="outline" disabled={createPending}>
              Add
            </Button>
          </form>
          {createState.error && (
            <Alert variant="destructive">
              <AlertDescription>{createState.error}</AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EquipmentClient({
  items,
  types,
  labs,
  canManage,
  canManageTypes,
}: {
  items: EquipmentListItem[];
  types: TypeOption[];
  labs: LabOption[];
  canManage: boolean;
  canManageTypes: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"create" | "types" | null>(null);
  const [query, setQuery] = useState("");
  const [labFilter, setLabFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);

  const labNames = [...new Set(items.map((i) => i.labName))].sort();
  const visible = items.filter((i) => {
    if (!showInactive && i.status === "inactive") return false;
    if (labFilter !== "all" && i.labName !== labFilter) return false;
    if (stateFilter !== "all" && i.availability.state !== stateFilter) return false;
    const q = query.trim().toLowerCase();
    if (q && !i.name.toLowerCase().includes(q) && !i.assetId.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-foreground">Equipment</h1>
        <div className="flex gap-2">
          {canManageTypes && (
            <Button size="sm" variant="outline" onClick={() => setDialog("types")}>
              Manage types
            </Button>
          )}
          {canManage && (
            <Button size="sm" onClick={() => setDialog("create")}>
              + New equipment
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or ID…"
          className="w-56"
          aria-label="Search equipment"
        />
        <Select value={labFilter} onValueChange={(v) => v && setLabFilter(v)}>
          <SelectTrigger size="sm" className="w-40" aria-label="Filter by lab">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All labs</SelectItem>
            {labNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={(v) => v && setStateFilter(v)}>
          <SelectTrigger size="sm" className="w-40" aria-label="Filter by state">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="due-soon">Due soon</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={showInactive} onCheckedChange={(c) => setShowInactive(c === true)} />
          Show inactive
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Lab</TableHead>
              <TableHead>Calibration</TableHead>
              <TableHead>Checks</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((item) => (
              <TableRow
                key={item.id}
                onClick={() => router.push(`/quality/equipment/${item.id}`)}
                className={`cursor-pointer ${item.status === "inactive" ? "opacity-60" : ""}`}
              >
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="font-mono text-sm">{item.assetId}</TableCell>
                <TableCell>{item.typeName}</TableCell>
                <TableCell>{item.labName}</TableCell>
                <TableCell>
                  <CalibrationCell item={item} />
                </TableCell>
                <TableCell>
                  <ChecksCell item={item} />
                </TableCell>
                <TableCell>
                  <StateBadge availability={item.availability} />
                </TableCell>
                <TableCell>
                  {item.status === "active" ? (
                    <Badge variant="outline">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {items.length === 0
                    ? "No equipment in your lab(s) yet."
                    : "No equipment matches the current filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        The state is computed live from calibration, required checks and out-of-service — Blocked
        equipment cannot be used for work (gating enforced in epic D). Recovery is by resolving the
        condition; there is deliberately no manual &quot;unblock&quot;.
      </p>

      {dialog === "create" && (
        <EquipmentDialog
          types={types}
          labs={labs}
          canManageTypes={canManageTypes}
          onManageTypes={() => setDialog("types")}
          onDone={() => setDialog(null)}
        />
      )}
      {dialog === "types" && <ManageTypesDialog types={types} onDone={() => setDialog(null)} />}
    </>
  );
}

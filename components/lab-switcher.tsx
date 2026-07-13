"use client";

import { useRef } from "react";
import { setActiveLabAction } from "@/app/(app)/actions";
import { ALL_LABS, type ActiveLab } from "@/lib/lab";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// US-A3 AC 4: multiple labs → always-available switcher; one lab → name only.
// The active lab is identified by id so a rename never resets it (finding 13).
// Admins (org-wide, 13 Jul 2026 decision) additionally get "All labs" — the
// default — so they never need an assignment to reach a lab.
export function LabSwitcher({
  labs,
  activeLabId,
  allowAll = false,
}: {
  labs: ActiveLab[];
  /** Lab id, or ALL_LABS for the admin org-wide view. */
  activeLabId: string;
  allowAll?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeName = labs.find((l) => l.id === activeLabId)?.name ?? "";

  if (!allowAll && labs.length <= 1) {
    return <span className="text-sm text-muted-foreground">Lab: {activeName}</span>;
  }

  return (
    <form ref={formRef} action={setActiveLabAction} className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Lab:</span>
      <input ref={inputRef} type="hidden" name="lab" value={activeLabId} />
      <Select
        defaultValue={activeLabId}
        onValueChange={(value) => {
          if (inputRef.current && value) {
            inputRef.current.value = String(value);
            formRef.current?.requestSubmit();
          }
        }}
      >
        {/* w-fit: in the header bar, the trigger hugs the lab name instead of
            taking the form-default full width. */}
        <SelectTrigger size="sm" className="w-fit" aria-label="Switch lab">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowAll && <SelectItem value={ALL_LABS}>All labs</SelectItem>}
          {labs.map((lab) => (
            <SelectItem key={lab.id} value={lab.id}>
              {lab.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </form>
  );
}

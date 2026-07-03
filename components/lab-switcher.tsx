"use client";

import { useRef } from "react";
import { setActiveLabAction } from "@/app/(app)/actions";
import type { ActiveLab } from "@/lib/lab";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// US-A3 AC 4: multiple labs → always-available switcher; one lab → name only.
// The active lab is identified by id so a rename never resets it (finding 13).
export function LabSwitcher({ labs, activeLabId }: { labs: ActiveLab[]; activeLabId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeName = labs.find((l) => l.id === activeLabId)?.name ?? "";

  if (labs.length <= 1) {
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
            inputRef.current.value = value;
            formRef.current?.requestSubmit();
          }
        }}
      >
        <SelectTrigger size="sm" aria-label="Switch lab">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
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

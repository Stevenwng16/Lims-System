"use client";

import { useRef } from "react";
import { setActiveLabAction } from "@/app/(app)/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// US-A3 AC 4: multiple labs → always-available switcher; one lab → name only.
export function LabSwitcher({ labs, activeLab }: { labs: string[]; activeLab: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (labs.length <= 1) {
    return <span className="text-sm text-muted-foreground">Lab: {activeLab}</span>;
  }

  return (
    <form ref={formRef} action={setActiveLabAction} className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Lab:</span>
      <input ref={inputRef} type="hidden" name="lab" value={activeLab} />
      <Select
        defaultValue={activeLab}
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
            <SelectItem key={lab} value={lab}>
              {lab}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </form>
  );
}

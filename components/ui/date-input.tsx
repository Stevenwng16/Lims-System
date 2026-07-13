"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Date entry in dd-mm-yyyy (13 Jul 2026 decision). Native date inputs render
// in the BROWSER's locale (often mm/dd/yyyy) and cannot be forced to the
// format NL labs expect, so this is a text field that displays/accepts
// dd-mm-yyyy while a hidden input posts the ISO yyyy-mm-dd under `name` —
// server actions and stores keep their existing ISO contract unchanged.
// Strict per ADR-4's reject-never-guess: an incomplete or impossible date
// (31-02-2026) never posts; it blocks submission with a clear message.

/** "2026-07-13" → "13-07-2026" ("" for anything non-ISO). */
export function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** Strict "13-07-2026" → "2026-07-13"; null for incomplete or impossible dates. */
export function displayToIso(text: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  // Round-trip through UTC so "31-02" (which Date would roll into March)
  // is rejected instead of silently reinterpreted.
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return real ? `${yyyy}-${mm}-${dd}` : null;
}

/** Progressive mask: "1" → "1", "1307" → "13-07", "13072026" → "13-07-2026". */
function formatDigits(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`;
}

type DateInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  /** ISO yyyy-mm-dd (what the hidden input posts / the parent state holds). */
  value?: string;
  defaultValue?: string;
  /** Called with the ISO date, or "" while the field is empty/incomplete. */
  onChange?: (iso: string) => void;
};

export function DateInput({
  name,
  value,
  defaultValue,
  onChange,
  className,
  ...props
}: DateInputProps) {
  const [display, setDisplay] = React.useState(() => isoToDisplay(value ?? defaultValue ?? ""));
  const [touched, setTouched] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const iso = displayToIso(display);

  // Controlled usage (filters): follow external value changes — e.g. a reset
  // button clearing the filter — but never clobber the field mid-edit.
  React.useEffect(() => {
    if (value === undefined) return;
    if (document.activeElement === inputRef.current) return;
    setDisplay((cur) => (value === (displayToIso(cur) ?? "") ? cur : isoToDisplay(value)));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = formatDigits(e.target.value);
    setDisplay(next);
    const nextIso = displayToIso(next);
    e.target.setCustomValidity(
      next && !nextIso ? "Enter a valid date as dd-mm-yyyy." : "",
    );
    onChange?.(nextIso ?? "");
  };

  return (
    <>
      <Input
        {...props}
        ref={inputRef}
        type="text"
        inputMode="numeric"
        placeholder="dd-mm-yyyy"
        maxLength={10}
        value={display}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
        aria-invalid={touched && display !== "" && !iso ? true : undefined}
        className={cn("tabular-nums", className)}
      />
      {/* The ISO value under the real field name — hidden AFTER the visible
          input so a wrapping <label> associates with the text field. */}
      {name && <input type="hidden" name={name} value={iso ?? ""} />}
    </>
  );
}

/** dd-mm-yyyy date + HH:mm time, posting "yyyy-mm-ddThh:mm" under `name`
 * (drop-in for the old datetime-local inputs). */
export function DateTimeInput({
  id,
  name,
  defaultValue,
  required,
  className,
}: {
  id?: string;
  name: string;
  /** "yyyy-mm-ddThh:mm" */
  defaultValue?: string;
  required?: boolean;
  className?: string;
}) {
  const [initialDate, initialTime] = (defaultValue ?? "").split("T");
  const [date, setDate] = React.useState(initialDate ?? "");
  const [time, setTime] = React.useState(initialTime ?? "");

  return (
    <div className={cn("flex gap-2", className)}>
      <DateInput
        id={id}
        defaultValue={initialDate}
        onChange={setDate}
        required={required}
        className="flex-1"
        aria-label="Date"
      />
      {/* Native time input: HH:mm is compact and unambiguous, unlike the
          locale-dependent date half of datetime-local. */}
      <Input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        required={required}
        className="w-28"
        aria-label="Time"
      />
      <input type="hidden" name={name} value={date && time ? `${date}T${time}` : ""} />
    </div>
  );
}

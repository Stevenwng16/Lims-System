"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { JobOverviewRow, JobStatus } from "@/lib/jobs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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

type Option = { id: string; label: string };
type SortKey = "id" | "customer" | "receivedAt" | "dueDate";

const STATUS_META: Record<JobStatus, { label: string; dot: string }> = {
  "not-started": { label: "Not started", dot: "⚪" },
  "in-progress": { label: "In progress", dot: "🔵" },
  completed: { label: "Completed", dot: "✅" },
  closed: { label: "Closed", dot: "⚫" },
};

const ALL = "__all__";

export function JobOverview({
  jobLabel,
  rows,
  typeOptions,
  methodOptions,
  customerOptions,
}: {
  jobLabel: string;
  rows: JobOverviewRow[];
  typeOptions: Option[];
  methodOptions: Option[];
  customerOptions: Option[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [typeId, setTypeId] = useState<string>(ALL);
  const [methodId, setMethodId] = useState<string>(ALL);
  const [customer, setCustomer] = useState<string>(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [sort, setSort] = useState<SortKey>("receivedAt");
  const [asc, setAsc] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      // AC 10: voided hidden by default; completed hidden unless shown OR the
      // user explicitly filters for the Completed status (audit finding 7).
      if (!showClosed && r.voided) return false;
      if (!showClosed && r.status === "completed" && status !== "completed") return false;
      if (q && !r.id.toLowerCase().includes(q) && !r.customer.toLowerCase().includes(q)) return false;
      if (status !== ALL && r.status !== status) return false;
      if (typeId !== ALL && !r.sampleTypeIds.includes(typeId)) return false;
      if (methodId !== ALL && !r.methodIds.includes(methodId)) return false;
      if (customer !== ALL && r.customer !== customer) return false;
      if (from && r.receivedAt.slice(0, 10) < from) return false;
      if (to && r.receivedAt.slice(0, 10) > to) return false;
      return true;
    });
    const dir = asc ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sort] ?? "";
      const bv = b[sort] ?? "";
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [rows, search, status, typeId, methodId, customer, from, to, showClosed, sort, asc]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(true);
    }
  };
  const sortArrow = (key: SortKey) => (sort === key ? (asc ? " ▲" : " ▼") : "");

  const reset = () => {
    setSearch("");
    setStatus(ALL);
    setTypeId(ALL);
    setMethodId(ALL);
    setCustomer(ALL);
    setFrom("");
    setTo("");
  };

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Search ${jobLabel.toLowerCase()} number or customer`}
        className="max-w-md"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => v && setStatus(v)}>
          <SelectTrigger size="sm" className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {(Object.keys(STATUS_META) as JobStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeId} onValueChange={(v) => v && setTypeId(v)}>
          <SelectTrigger size="sm" className="w-40" aria-label="Filter by sample type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {typeOptions.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={methodId} onValueChange={(v) => v && setMethodId(v)}>
          <SelectTrigger size="sm" className="w-48" aria-label="Filter by method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All methods</SelectItem>
            {methodOptions.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={customer} onValueChange={(v) => v && setCustomer(v)}>
          <SelectTrigger size="sm" className="w-48" aria-label="Filter by customer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All customers</SelectItem>
            {customerOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-1 text-sm text-muted-foreground">
          Received
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" />
          –
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" />
        </label>

        <button
          type="button"
          onClick={reset}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Reset
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={showClosed} onCheckedChange={(v) => setShowClosed(!!v)} />
        Show completed &amp; voided {jobLabel.toLowerCase()}s
      </label>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button type="button" onClick={() => toggleSort("id")} className="hover:underline">
                  {jobLabel} no.{sortArrow("id")}
                </button>
              </TableHead>
              <TableHead>
                <button type="button" onClick={() => toggleSort("customer")} className="hover:underline">
                  Customer{sortArrow("customer")}
                </button>
              </TableHead>
              <TableHead>
                <button type="button" onClick={() => toggleSort("receivedAt")} className="hover:underline">
                  Received{sortArrow("receivedAt")}
                </button>
              </TableHead>
              <TableHead>Sample type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <button type="button" onClick={() => toggleSort("dueDate")} className="hover:underline">
                  Deadline{sortArrow("dueDate")}
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow
                key={r.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/jobs/${r.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") router.push(`/jobs/${r.id}`);
                }}
                className={`cursor-pointer ${r.voided ? "opacity-50" : ""}`}
              >
                <TableCell className="font-mono font-medium">
                  {/* Keep the anchor for middle-click / open-in-new-tab; stop it
                      double-firing the row handler. */}
                  <Link
                    href={`/jobs/${r.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="underline-offset-4 hover:underline"
                  >
                    {r.id}
                  </Link>
                </TableCell>
                <TableCell>{r.customer}</TableCell>
                <TableCell className="text-muted-foreground">{r.receivedAt.slice(0, 10)}</TableCell>
                <TableCell>{r.sampleTypeLabel}</TableCell>
                <TableCell>
                  {r.voided ? (
                    <Badge variant="secondary">voided</Badge>
                  ) : (
                    <span>
                      {STATUS_META[r.status].dot} {STATUS_META[r.status].label}
                    </span>
                  )}
                </TableCell>
                <TableCell className={r.overdue ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
                  {r.dueDate || "—"} {r.overdue && "⚠️"}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No {jobLabel.toLowerCase()}s match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

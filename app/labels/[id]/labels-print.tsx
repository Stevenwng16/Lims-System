"use client";

import { useRouter } from "next/navigation";
import type { OrgSettings } from "@/lib/mock-db";
import { Barcode } from "@/lib/barcode/code128";
import { Button } from "@/components/ui/button";

export type LabelData = {
  sampleId: string;
  customer: string;
  typeName: string;
  jobNumber: string;
  date: string;
};

function Label({ data, barcode }: { data: LabelData; barcode: OrgSettings["barcode"] }) {
  // Typography scales with the configured label height (AC 6) instead of fixed
  // px, and the barcode + mandatory human-readable ID can never be clipped:
  // they are shrink-0 at the top; only optional fields absorb any overflow
  // (audit findings).
  const baseFontPt = Math.max(barcode.heightMm * 0.28, 4.5);
  return (
    <div
      className="flex flex-col justify-start gap-[0.15em] overflow-hidden rounded-sm border border-black bg-white p-[1.5mm] text-black"
      style={{
        width: `${barcode.widthMm}mm`,
        height: `${barcode.heightMm}mm`,
        fontSize: `${baseFontPt}pt`,
      }}
    >
      <Barcode value={data.sampleId} className="h-[42%] w-full shrink-0" />
      {/* The human-readable sample ID is always printed (AC 5). */}
      <div className="shrink-0 text-center font-mono text-[0.9em] leading-tight">{data.sampleId}</div>
      {barcode.showCustomer && (
        <div className="truncate text-center text-[0.8em] leading-tight">{data.customer}</div>
      )}
      {barcode.showSampleType && (
        <div className="text-center text-[0.8em] leading-tight">{data.typeName}</div>
      )}
      {barcode.showJobNumber && (
        <div className="text-center text-[0.8em] leading-tight">{data.jobNumber}</div>
      )}
      {barcode.showDate && <div className="text-center text-[0.8em] leading-tight">{data.date}</div>}
    </div>
  );
}

export function LabelsPrint({
  jobId,
  labels,
  barcode,
  voidedExcluded,
}: {
  jobId: string;
  labels: LabelData[];
  barcode: OrgSettings["barcode"];
  voidedExcluded: number;
}) {
  const router = useRouter();

  const fields = [
    "ID",
    barcode.showCustomer && "customer",
    barcode.showSampleType && "type",
    barcode.showJobNumber && "job no.",
    barcode.showDate && "date",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-screen bg-zinc-100 p-6 dark:bg-zinc-100">
      {/* Print CSS: hide the toolbar and page chrome when printing. */}
      <style>{`@media print { .print-hidden { display: none !important; } body { background: #fff !important; } @page { margin: 8mm; } }`}</style>

      <div className="print-hidden mx-auto mb-6 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4 text-black">
        <div>
          <h1 className="text-lg font-semibold">Print preview — Job {jobId}</h1>
          <p className="text-sm text-zinc-600">
            Symbology: Code 128 · Size: {barcode.widthMm} × {barcode.heightMm} mm · Fields: {fields}
          </p>
          <p className="text-sm text-zinc-600">
            {labels.length} label{labels.length === 1 ? "" : "s"}
            {voidedExcluded > 0 && ` (${voidedExcluded} voided sample${voidedExcluded === 1 ? "" : "s"} excluded)`}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            No label printer? Choose &quot;Save as PDF&quot; in the print dialog — labels print at
            their configured physical size on standard stationery.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/jobs/${jobId}`)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      <div className="mx-auto flex max-w-4xl flex-wrap gap-2 print:max-w-none print:gap-1">
        {labels.map((data) => (
          <Label key={data.sampleId} data={data} barcode={barcode} />
        ))}
      </div>
    </div>
  );
}

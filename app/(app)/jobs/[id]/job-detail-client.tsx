"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useActionState } from "react";
import type { JobStatus, JobView, SampleView } from "@/lib/jobs";
import type { MockSample, SampleAcceptance } from "@/lib/mock-db";
import {
  addSampleAction,
  addSampleAttachmentAction,
  recordConsultationAction,
  setSampleAcceptanceAction,
  voidJobAction,
  voidSampleAction,
  type JobFormState,
} from "../actions";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const initialState: JobFormState = {};

export type HistoryEvent = { when: string; who: string; action: string };
type TypeOption = { id: string; name: string };
type MethodOption = { id: string; label: string };
type BatchRow = {
  id: string;
  methodLabel: string;
  methodVersion: number;
  status: "open" | "awaiting-review" | "completed" | "voided";
  statusLabel: string;
  containedSampleIds: string[];
};

const JOB_STATUS: Record<JobStatus, { label: string; dot: string }> = {
  "not-started": { label: "Not started", dot: "⚪" },
  "in-progress": { label: "In progress", dot: "🔵" },
  completed: { label: "Completed", dot: "✅" },
  closed: { label: "Closed", dot: "⚫" },
};

// The lifecycle status on a SampleView is DERIVED server-side from batch
// membership (US-D1) — the page decorates it before rendering.
function sampleStatusLabel(s: SampleView): string {
  if (s.voided) return "Voided";
  if (s.acceptance === "rejected") return "Rejected";
  if (s.acceptance === null) return "Awaiting decision";
  switch (s.status) {
    case "in-batch":
      return "In batch";
    case "in-progress":
      return "In progress";
    case "completed":
      return "Completed";
    default:
      return "Received";
  }
}

function AcceptanceText({ sample }: { sample: MockSample }) {
  if (sample.acceptance === null) return <span className="text-destructive">awaiting decision</span>;
  if (sample.acceptance === "rejected") return <span className="text-destructive">Rejected</span>;
  if (sample.acceptance === "accepted-with-reservation") return <span>Accepted w/ reservation</span>;
  return <span>Accepted</span>;
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

// ---- dialogs -------------------------------------------------------------

function AcceptanceDialog({ jobId, sample, onDone }: { jobId: string; sample: MockSample; onDone: () => void }) {
  const [state, submit, pending] = useActionState(setSampleAcceptanceAction, initialState);
  const [choice, setChoice] = useState<SampleAcceptance>("accepted");
  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  const LABELS: Record<SampleAcceptance, string> = {
    accepted: "Accepted",
    "accepted-with-reservation": "Accepted with reservation",
    rejected: "Rejected",
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Acceptance decision — {sample.id}</DialogTitle>
          <DialogDescription>
            §7.4.3: every sample needs a decision before it can enter a batch. A rejected sample can
            never be batched.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="sampleId" value={sample.id} />
          <input type="hidden" name="acceptance" value={choice} />
          <div className="space-y-2 text-sm">
            {(["accepted", "accepted-with-reservation", "rejected"] as SampleAcceptance[]).map((c) => (
              <label key={c} className="flex items-center gap-2">
                <input type="radio" name="choice" checked={choice === c} onChange={() => setChoice(c)} />
                {LABELS[c]}
              </label>
            ))}
          </div>
          {choice === "accepted-with-reservation" && (
            <div className="space-y-2">
              <Label htmlFor="reason">Reservation reason (carried to the report)</Label>
              <Textarea id="reason" name="reason" required autoFocus />
            </div>
          )}
          {sample.deviationType === "mismatch" && !sample.consultation && choice !== "rejected" && (
            <Alert variant="destructive">
              <AlertDescription>
                This sample does not match its description — record a customer consultation first.
              </AlertDescription>
            </Alert>
          )}
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Record decision"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConsultationDialog({ jobId, sample, onDone }: { jobId: string; sample: MockSample; onDone: () => void }) {
  const [state, submit, pending] = useActionState(recordConsultationAction, initialState);
  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Customer consultation — {sample.id}</DialogTitle>
          <DialogDescription>
            §7.4.3: record who was consulted, when, and the outcome. Required before accepting a
            sample that does not match its description.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="sampleId" value={sample.id} />
          <div className="space-y-2">
            <Label htmlFor="who">Who was consulted</Label>
            <Input id="who" name="who" required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="when">When (optional)</Label>
            <Input id="when" name="when" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="outcome">Outcome</Label>
            <Textarea id="outcome" name="outcome" required />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Record consultation"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttachmentDialog({ jobId, sample, onDone }: { jobId: string; sample: MockSample; onDone: () => void }) {
  const [state, submit, pending] = useActionState(addSampleAttachmentAction, initialState);
  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deviation evidence — {sample.id}</DialogTitle>
          <DialogDescription>
            Optional photo/attachment stored immutably with a SHA-256 checksum (§7.4 / ADR-3).
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="sampleId" value={sample.id} />
          <div className="space-y-2">
            <Label htmlFor="file">File</Label>
            <Input id="file" name="file" type="file" accept="image/*,.pdf" required />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Uploading…" : "Upload evidence"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VoidDialog({
  jobId,
  sampleId,
  title,
  onDone,
}: {
  jobId: string;
  sampleId?: string;
  title: string;
  onDone: () => void;
}) {
  const action = sampleId ? voidSampleAction : voidJobAction;
  const [state, submit, pending] = useActionState(action, initialState);
  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Voided records are retained for the audit trail, never deleted. A reason is required.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="jobId" value={jobId} />
          {sampleId && <input type="hidden" name="sampleId" value={sampleId} />}
          <div className="space-y-2">
            <Label htmlFor="void-reason">Reason</Label>
            <Textarea id="void-reason" name="reason" required autoFocus />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" variant="destructive" className="w-full" disabled={pending}>
            {pending ? "Voiding…" : "Void"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// AC 7: add a sample to an existing job — reuses the registration fields; the
// acceptance decision is recorded afterwards via the Acceptance dialog.
function AddSampleDialog({
  jobId,
  sampleTypes,
  labMethods,
  onDone,
}: {
  jobId: string;
  sampleTypes: TypeOption[];
  labMethods: MethodOption[];
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(addSampleAction, initialState);
  const [typeId, setTypeId] = useState("");
  const [deviation, setDeviation] = useState(false);
  const [deviationType, setDeviationType] = useState<"cosmetic" | "mismatch">("cosmetic");
  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add sample</DialogTitle>
          <DialogDescription>
            A new immutable sample ID is issued. Record the acceptance decision afterwards.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="typeId" value={typeId} />
          <input type="hidden" name="condition" value={deviation ? "deviation" : "conforming"} />
          <input type="hidden" name="deviationType" value={deviation ? deviationType : "none"} />
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={typeId} onValueChange={(v) => v && setTypeId(v)}>
              <SelectTrigger aria-label="Sample type">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                {sampleTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-desc">Description / matrix</Label>
            <Input id="add-desc" name="description" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-cust-ref">Customer sample ref (optional)</Label>
            <Input id="add-cust-ref" name="customerSampleRef" />
          </div>
          <div className="flex gap-3">
            <div className="space-y-2">
              <Label htmlFor="add-qty">Quantity (optional)</Label>
              <Input id="add-qty" name="quantity" className="w-28" placeholder="1.5" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-unit">Unit</Label>
              <Input id="add-unit" name="quantityUnit" className="w-24" placeholder="L" />
            </div>
          </div>
          {labMethods.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-sm">Requested methods</legend>
              <div className="flex flex-wrap gap-3">
                {labMethods.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <Checkbox name="requestedMethodIds" value={m.id} />
                    {m.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={deviation} onCheckedChange={(c) => setDeviation(!!c)} />
              Deviation on receipt (§7.4)
            </label>
            {deviation && (
              <div className="ml-6 space-y-2">
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={deviationType === "cosmetic"}
                      onChange={() => setDeviationType("cosmetic")}
                    />
                    Cosmetic
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={deviationType === "mismatch"}
                      onChange={() => setDeviationType("mismatch")}
                    />
                    Does not match description
                  </label>
                </div>
                <Input name="deviationNote" placeholder="Deviation note" />
              </div>
            )}
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Adding…" : "Add sample"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- main ----------------------------------------------------------------

type Dialogs =
  | { kind: "accept"; sample: MockSample }
  | { kind: "consult"; sample: MockSample }
  | { kind: "attach"; sample: MockSample }
  | { kind: "void-sample"; sample: MockSample }
  | { kind: "void-job" }
  | { kind: "add-sample" }
  | null;

export function JobDetail({
  job,
  jobLabel,
  labName,
  typeNames,
  methodNames,
  canManage,
  canPrint,
  status,
  overdue,
  history,
  sampleTypes,
  labMethods,
  batches,
}: {
  job: JobView;
  jobLabel: string;
  batches: BatchRow[];
  labName: string;
  typeNames: Record<string, string>;
  methodNames: Record<string, string>;
  canManage: boolean;
  canPrint: boolean;
  status: JobStatus;
  overdue: boolean;
  history: HistoryEvent[];
  sampleTypes: TypeOption[];
  labMethods: MethodOption[];
}) {
  const [dialog, setDialog] = useState<Dialogs>(null);
  const close = () => setDialog(null);

  return (
    <>
      {/* Persistent header (AC 2) — visible across every tab. */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-lg font-semibold text-foreground">{job.id}</span>
          <span className="text-muted-foreground">·</span>
          <span>{job.customer}</span>
          <span className="text-muted-foreground">·</span>
          {job.voided ? (
            <Badge variant="secondary">voided</Badge>
          ) : (
            <span>
              {JOB_STATUS[status].dot} {JOB_STATUS[status].label}
            </span>
          )}
          <span className="text-muted-foreground">·</span>
          <span className={overdue ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
            {job.dueDate || "no deadline"} {overdue && "⚠️"}
          </span>
        </div>
        {job.voided && (
          <p className="mt-2 text-sm text-destructive">
            This {jobLabel.toLowerCase()} is voided: {job.voidReason}
          </p>
        )}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="samples">Samples</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Details (AC 4/5) */}
        <TabsContent value="details" className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
            <Field label={`${jobLabel} number`} value={job.id} />
            <Field label="Customer" value={job.customer} />
            <Field label="Customer reference" value={job.customerRef} />
            <Field label="Lab (fixed at creation)" value={labName} />
            <Field label="Received" value={job.receivedAt.replace("T", " ")} />
            <Field label="Received by" value={job.receivedBy} />
            <Field label="Priority" value={job.priority} />
            <Field label="Due date" value={job.dueDate} />
            <Field label="Storage location" value={job.storageLocation} />
            <Field
              label="Requested methods"
              value={job.requestedMethodIds.map((id) => methodNames[id] ?? id).join(", ")}
            />
            <Field label="Notes" value={job.notes} />
          </dl>
          {canManage && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" render={<Link href={`/jobs/${job.id}/edit`} />}>
                Edit {jobLabel.toLowerCase()}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDialog({ kind: "void-job" })}>
                Void {jobLabel.toLowerCase()}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Samples (AC 6/7/8/9) */}
        <TabsContent value="samples" className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {job.samples.filter((s) => !s.voided).length} sample(s)
            </span>
            <div className="flex gap-2">
              {canManage && (
                <Button size="sm" onClick={() => setDialog({ kind: "add-sample" })}>
                  + Add sample
                </Button>
              )}
              {canPrint && (
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href={`/labels/${encodeURIComponent(job.id)}`} />}
                >
                  🖨 Print all
                </Button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sample ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Cond.</TableHead>
                  <TableHead>Acceptance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.samples.map((s) => (
                  <TableRow
                    key={s.id}
                    // AC 6: a rejected OR voided sample is shown but muted.
                    className={s.voided || s.acceptance === "rejected" ? "opacity-50" : undefined}
                  >
                    <TableCell className="font-mono text-sm">{s.id}</TableCell>
                    <TableCell>{typeNames[s.typeId] ?? s.typeId}</TableCell>
                    <TableCell>
                      {s.condition === "deviation" ? (
                        <span title={s.deviationNote} className="text-amber-700 dark:text-amber-400">
                          ⚠
                        </span>
                      ) : (
                        "OK"
                      )}
                    </TableCell>
                    <TableCell>
                      <AcceptanceText sample={s} />
                    </TableCell>
                    <TableCell>{sampleStatusLabel(s)}</TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canManage && !s.voided && (
                          <>
                            <Button variant="ghost" size="xs" onClick={() => setDialog({ kind: "accept", sample: s })}>
                              Decision
                            </Button>
                            {s.condition === "deviation" && (
                              <Button variant="ghost" size="xs" onClick={() => setDialog({ kind: "consult", sample: s })}>
                                Consult
                              </Button>
                            )}
                            {s.condition === "deviation" && (
                              <Button variant="ghost" size="xs" onClick={() => setDialog({ kind: "attach", sample: s })}>
                                Evidence
                              </Button>
                            )}
                            <Button variant="ghost" size="xs" onClick={() => setDialog({ kind: "void-sample", sample: s })}>
                              Void
                            </Button>
                          </>
                        )}
                        {canPrint && !s.voided && (
                          <Button
                            variant="ghost"
                            size="xs"
                            aria-label={`Print label for ${s.id}`}
                            render={
                              <Link
                                href={`/labels/${encodeURIComponent(job.id)}?sample=${encodeURIComponent(s.id)}`}
                              />
                            }
                          >
                            🖨
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {job.samples.some((s) => s.reservationReason || s.consultation) && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {job.samples
                .filter((s) => s.reservationReason)
                .map((s) => (
                  <p key={`r-${s.id}`}>
                    {s.id}: reservation — {s.reservationReason}
                  </p>
                ))}
              {job.samples
                .filter((s) => s.consultation)
                .map((s) => (
                  <p key={`c-${s.id}`}>
                    {s.id}: consultation — {s.consultation?.who} · {s.consultation?.outcome}
                  </p>
                ))}
            </div>
          )}
        </TabsContent>

        {/* Batches (AC 10) — real since US-D1/D3. */}
        <TabsContent value="batches">
          {batches.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
              No batches contain this {jobLabel.toLowerCase()}&apos;s samples yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Samples from this {jobLabel.toLowerCase()}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <Link href={`/batches/${b.id}`} className="font-mono text-sm text-primary underline-offset-4 hover:underline">
                          {b.id}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {b.methodLabel} <span className="text-xs text-muted-foreground">v{b.methodVersion}</span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {b.status === "voided" ? <Badge variant="secondary">Voided</Badge> : b.statusLabel}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{b.containedSampleIds.join(", ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* History (AC 11) — a view on the audit log, filtered to this job. */}
        <TabsContent value="history" className="space-y-3">
          {/* Real attributed events since the pass-4 fix — no longer an
              "illustrative" reconstruction from current state. */}
          <p className="text-xs text-muted-foreground">
            A read-only view of the append-only audit trail for this {jobLabel.toLowerCase()} —
            every registration, edit (with before/after), acceptance decision, consultation,
            evidence upload and void, with actor and timestamp.
          </p>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground">{e.when}</TableCell>
                    <TableCell className="text-muted-foreground">{e.who}</TableCell>
                    <TableCell>{e.action}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {dialog?.kind === "accept" && (
        <AcceptanceDialog key={dialog.sample.id} jobId={job.id} sample={dialog.sample} onDone={close} />
      )}
      {dialog?.kind === "consult" && (
        <ConsultationDialog key={dialog.sample.id} jobId={job.id} sample={dialog.sample} onDone={close} />
      )}
      {dialog?.kind === "attach" && (
        <AttachmentDialog key={dialog.sample.id} jobId={job.id} sample={dialog.sample} onDone={close} />
      )}
      {dialog?.kind === "void-sample" && (
        <VoidDialog
          key={dialog.sample.id}
          jobId={job.id}
          sampleId={dialog.sample.id}
          title={`Void sample ${dialog.sample.id}`}
          onDone={close}
        />
      )}
      {dialog?.kind === "void-job" && (
        <VoidDialog jobId={job.id} title={`Void ${jobLabel.toLowerCase()} ${job.id}`} onDone={close} />
      )}
      {dialog?.kind === "add-sample" && (
        <AddSampleDialog jobId={job.id} sampleTypes={sampleTypes} labMethods={labMethods} onDone={close} />
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useActionState } from "react";
import type { MockJob, MockSample, SampleAcceptance } from "@/lib/mock-db";
import {
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: JobFormState = {};

const ACCEPTANCE_LABELS: Record<SampleAcceptance, string> = {
  accepted: "Accepted",
  "accepted-with-reservation": "Accepted with reservation",
  rejected: "Rejected",
};

function AcceptanceBadge({ sample }: { sample: MockSample }) {
  if (sample.voided) return <Badge variant="secondary">voided</Badge>;
  if (sample.acceptance === null) return <Badge variant="destructive">awaiting decision</Badge>;
  if (sample.acceptance === "rejected") return <Badge variant="destructive">rejected</Badge>;
  if (sample.acceptance === "accepted-with-reservation")
    return <Badge variant="outline">accepted · reservation</Badge>;
  return <Badge variant="outline">accepted</Badge>;
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

// Acceptance dialog: reservation needs a reason; rejection and plain accept do
// not. The server also enforces the mismatch→consultation gate (§7.4.3).
function AcceptanceDialog({
  jobId,
  sample,
  onDone,
}: {
  jobId: string;
  sample: MockSample;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(setSampleAcceptanceAction, initialState);
  const [choice, setChoice] = useState<SampleAcceptance>("accepted");

  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Acceptance decision — {sample.id}</DialogTitle>
          <DialogDescription>
            §7.4.3: every sample needs an acceptance decision before it can enter a batch. A
            rejected sample can never be batched.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="sampleId" value={sample.id} />
          <input type="hidden" name="acceptance" value={choice} />
          <div className="space-y-2 text-sm">
            {(["accepted", "accepted-with-reservation", "rejected"] as SampleAcceptance[]).map((c) => (
              <label key={c} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="choice"
                  checked={choice === c}
                  onChange={() => setChoice(c)}
                />
                {ACCEPTANCE_LABELS[c]}
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

function ConsultationDialog({
  jobId,
  sample,
  onDone,
}: {
  jobId: string;
  sample: MockSample;
  onDone: () => void;
}) {
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

function AttachmentDialog({
  jobId,
  sample,
  onDone,
}: {
  jobId: string;
  sample: MockSample;
  onDone: () => void;
}) {
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

type Dialogs =
  | { kind: "accept"; sample: MockSample }
  | { kind: "consult"; sample: MockSample }
  | { kind: "attach"; sample: MockSample }
  | { kind: "void-sample"; sample: MockSample }
  | { kind: "void-job" }
  | null;

export function JobDetail({
  job,
  jobLabel,
  typeNames,
  methodNames,
  canManage,
}: {
  job: MockJob;
  jobLabel: string;
  typeNames: Record<string, string>;
  methodNames: Record<string, string>;
  canManage: boolean;
}) {
  const [dialog, setDialog] = useState<Dialogs>(null);
  const close = () => setDialog(null);

  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-mono text-xl font-semibold text-foreground">{job.id}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {job.customer}
            {job.customerRef && ` · ${job.customerRef}`} · received {job.receivedAt.replace("T", " ")}
          </p>
          {job.voided && (
            <p className="mt-1 text-sm text-destructive">Voided: {job.voidReason}</p>
          )}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" render={<Link href={`/jobs/${job.id}/edit`} />}>
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDialog({ kind: "void-job" })}>
              Void {jobLabel.toLowerCase()}
            </Button>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
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

      <div className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Samples
        </h2>
        {job.samples.map((sample) => (
          <div
            key={sample.id}
            className={`space-y-2 rounded-lg border p-4 ${sample.voided ? "opacity-60" : "bg-card"}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{sample.id}</span>
                <span className="text-sm text-muted-foreground">
                  {typeNames[sample.typeId] ?? sample.typeId} · {sample.description}
                </span>
              </div>
              <AcceptanceBadge sample={sample} />
            </div>

            {sample.condition === "deviation" && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                ⚠ {sample.deviationType === "mismatch" ? "Does not match description" : "Deviation"}
                {sample.deviationNote && `: ${sample.deviationNote}`}
              </p>
            )}
            {sample.reservationReason && (
              <p className="text-sm text-muted-foreground">Reservation: {sample.reservationReason}</p>
            )}
            {sample.consultation && (
              <p className="text-sm text-muted-foreground">
                Consultation: {sample.consultation.who}
                {sample.consultation.when && ` (${sample.consultation.when})`} —{" "}
                {sample.consultation.outcome}
              </p>
            )}
            {sample.voided && (
              <p className="text-sm text-destructive">Voided: {sample.voidReason}</p>
            )}
            {sample.requestedMethodIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Methods: {sample.requestedMethodIds.map((id) => methodNames[id] ?? id).join(", ")}
              </p>
            )}
            {sample.attachments.length > 0 && (
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {sample.attachments.map((a) => (
                  <li key={a.id} className="font-mono">
                    📎 {a.fileName} · sha256 {a.sha256.slice(0, 16)}…
                  </li>
                ))}
              </ul>
            )}

            {canManage && !sample.voided && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" size="xs" onClick={() => setDialog({ kind: "accept", sample })}>
                  {sample.acceptance ? "Change decision" : "Acceptance decision"}
                </Button>
                {/* Forced for a mismatch; optional (still available) for any
                    deviation — AC 8. */}
                {sample.condition === "deviation" && (
                  <Button variant="outline" size="xs" onClick={() => setDialog({ kind: "consult", sample })}>
                    {sample.consultation ? "Update consultation" : "Record consultation"}
                  </Button>
                )}
                {sample.condition === "deviation" && (
                  <Button variant="outline" size="xs" onClick={() => setDialog({ kind: "attach", sample })}>
                    Add evidence
                  </Button>
                )}
                <Button variant="ghost" size="xs" onClick={() => setDialog({ kind: "void-sample", sample })}>
                  Void sample
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

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
    </>
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { jobApi, type JobActor, type JobInput, type SampleInput } from "@/lib/jobs";
import { resolveOrgContext } from "@/lib/auth/context";
import type { SampleAcceptance } from "@/lib/mock-db";

export type JobFormState = { error?: string; success?: boolean };

// All org roles may view jobs; the mock API gates create/manage to Admin / Lab
// manager within their labs. Live-validated + org-gated via the shared
// resolver (audit findings 4/6).
export async function resolveJobActor(): Promise<JobActor> {
  const ctx = await resolveOrgContext();
  // role null ⇒ a platform-admin with no valid support context → vendor console
  // (never "/", which would bounce back here — audit finding 6).
  if (ctx.role === null || !ctx.orgId) redirect("/platform");
  return {
    email: ctx.user.email,
    role: ctx.role,
    labs: ctx.labs,
    orgId: ctx.orgId,
    isSupport: ctx.isSupport,
  };
}

function parseJobInput(formData: FormData): JobInput | { parseError: string } {
  try {
    const samples = JSON.parse(String(formData.get("samplesJson") ?? "[]")) as SampleInput[];
    return {
      labId: String(formData.get("labId") ?? ""),
      customer: String(formData.get("customer") ?? ""),
      customerRef: String(formData.get("customerRef") ?? ""),
      receivedAt: String(formData.get("receivedAt") ?? ""),
      requestedMethodIds: formData.getAll("requestedMethodIds").map(String),
      priority: String(formData.get("priority") ?? "Standard"),
      dueDate: String(formData.get("dueDate") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      storageLocation: String(formData.get("storageLocation") ?? ""),
      samples: samples.map((s) => ({
        // The id is the edit-mode match key (US-C3 AC 5/12): dropping it made
        // every edit re-mint ALL sample IDs and destroy their acceptance/
        // consultation/status records (Fable re-review finding 4 — high).
        id: typeof s.id === "string" && s.id ? s.id : undefined,
        typeId: s.typeId,
        description: s.description,
        customerSampleRef: s.customerSampleRef,
        quantity: s.quantity === null || s.quantity === undefined ? "" : String(s.quantity),
        quantityUnit: s.quantityUnit ?? "",
        requestedMethodIds: Array.isArray(s.requestedMethodIds) ? s.requestedMethodIds : [],
        condition: s.condition === "deviation" ? "deviation" : "conforming",
        deviationType: s.deviationType ?? "none",
        deviationNote: s.deviationNote ?? "",
        storageLocation: s.storageLocation ?? "",
      })),
    };
  } catch {
    return { parseError: "The form data could not be read — reload the page and try again." };
  }
}

export async function createJobAction(
  _prev: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const actor = await resolveJobActor();
  const input = parseJobInput(formData);
  if ("parseError" in input) return { error: input.parseError };
  const result = await jobApi.createJob(actor, input);
  if (result.status === "error") return { error: result.message };
  revalidatePath("/jobs");
  redirect(`/jobs/${result.jobId}`);
}

export async function updateJobAction(
  _prev: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const actor = await resolveJobActor();
  const jobId = String(formData.get("jobId") ?? "");
  const input = parseJobInput(formData);
  if ("parseError" in input) return { error: input.parseError };
  const result = await jobApi.updateJob(actor, jobId, input);
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/jobs/${jobId}`);
  return { success: true };
}

export async function setSampleAcceptanceAction(
  _prev: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const actor = await resolveJobActor();
  const jobId = String(formData.get("jobId") ?? "");
  const result = await jobApi.setSampleAcceptance(
    actor,
    jobId,
    String(formData.get("sampleId") ?? ""),
    String(formData.get("acceptance") ?? "") as SampleAcceptance,
    String(formData.get("reason") ?? ""),
  );
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/jobs/${jobId}`);
  return { success: true };
}

export async function recordConsultationAction(
  _prev: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const actor = await resolveJobActor();
  const jobId = String(formData.get("jobId") ?? "");
  const result = await jobApi.recordConsultation(actor, jobId, String(formData.get("sampleId") ?? ""), {
    who: String(formData.get("who") ?? ""),
    when: String(formData.get("when") ?? ""),
    outcome: String(formData.get("outcome") ?? ""),
  });
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/jobs/${jobId}`);
  return { success: true };
}

export async function addSampleAction(
  _prev: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const actor = await resolveJobActor();
  const jobId = String(formData.get("jobId") ?? "");
  const condition = formData.get("condition") === "deviation" ? "deviation" : "conforming";
  const sample: SampleInput = {
    typeId: String(formData.get("typeId") ?? ""),
    description: String(formData.get("description") ?? ""),
    customerSampleRef: String(formData.get("customerSampleRef") ?? ""),
    quantity: String(formData.get("quantity") ?? ""),
    quantityUnit: String(formData.get("quantityUnit") ?? ""),
    requestedMethodIds: formData.getAll("requestedMethodIds").map(String),
    condition,
    deviationType: (String(formData.get("deviationType") ?? "none") as SampleInput["deviationType"]),
    deviationNote: String(formData.get("deviationNote") ?? ""),
    storageLocation: String(formData.get("storageLocation") ?? ""),
  };
  const result = await jobApi.addSample(actor, jobId, sample);
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/jobs/${jobId}`);
  return { success: true };
}

export async function addSampleAttachmentAction(
  _prev: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const actor = await resolveJobActor();
  const jobId = String(formData.get("jobId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await jobApi.addSampleAttachment(actor, jobId, String(formData.get("sampleId") ?? ""), {
    fileName: file.name,
    bytes,
  });
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/jobs/${jobId}`);
  return { success: true };
}

export async function voidJobAction(_prev: JobFormState, formData: FormData): Promise<JobFormState> {
  const actor = await resolveJobActor();
  const jobId = String(formData.get("jobId") ?? "");
  const result = await jobApi.voidJob(actor, jobId, String(formData.get("reason") ?? ""));
  if (result.status === "error") return { error: result.message };
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  return { success: true };
}

export async function voidSampleAction(
  _prev: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const actor = await resolveJobActor();
  const jobId = String(formData.get("jobId") ?? "");
  const result = await jobApi.voidSample(
    actor,
    jobId,
    String(formData.get("sampleId") ?? ""),
    String(formData.get("reason") ?? ""),
  );
  if (result.status === "error") return { error: result.message };
  revalidatePath(`/jobs/${jobId}`);
  return { success: true };
}

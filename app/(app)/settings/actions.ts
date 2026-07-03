"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { settingsApi } from "@/lib/settings";
import { resolveOrgContext } from "@/lib/auth/context";

export type SettingsFormState = { error?: string; success?: boolean };

// Settings are Admin-only (US-A7 authorization). Live-validated via the shared
// resolver, which also gates the org context to the session's real tenant
// (audit findings 4/6).
export async function requireAdminOrgId(): Promise<string> {
  const ctx = await resolveOrgContext();
  if (ctx.role !== "admin" || !ctx.orgId) redirect("/");
  return ctx.orgId;
}

function done(result: { status: "success" } | { status: "error"; message: string }): SettingsFormState {
  if (result.status === "error") return { error: result.message };
  revalidatePath("/settings");
  return { success: true };
}

export async function saveSecurityAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const orgId = await requireAdminOrgId();
  return done(
    await settingsApi.updateSecurity(orgId, {
      minPasswordLength: Number(formData.get("minPasswordLength")),
      requireComplexity: formData.get("requireComplexity") === "on",
      lockoutThreshold: Number(formData.get("lockoutThreshold")),
      sessionTimeoutMinutes: Number(formData.get("sessionTimeoutMinutes")),
      requireMfa: formData.get("requireMfa") === "on",
    }),
  );
}

export async function saveIdentifiersAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const orgId = await requireAdminOrgId();
  return done(
    await settingsApi.updateIdentifiers(
      orgId,
      {
        jobFormat: String(formData.get("jobFormat") ?? ""),
        sampleFormat: String(formData.get("sampleFormat") ?? ""),
        batchFormat: String(formData.get("batchFormat") ?? ""),
        sequenceReset: (formData.get("sequenceReset") ?? "yearly") as "never" | "yearly" | "monthly",
      },
      String(formData.get("jobLabel") ?? ""),
    ),
  );
}

export async function saveListAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const orgId = await requireAdminOrgId();
  const list = formData.get("list") === "resultQualifiers" ? "resultQualifiers" : "sampleTypes";
  const ids = formData.getAll("itemId").map(String);
  return done(
    await settingsApi.updateList(orgId, list, {
      items: ids.map((id) => ({
        id,
        name: String(formData.get(`name-${id}`) ?? ""),
        active: formData.get(`active-${id}`) === "on",
      })),
      newName: String(formData.get("newName") ?? "") || undefined,
    }),
  );
}

export async function saveBarcodeAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const orgId = await requireAdminOrgId();
  return done(
    await settingsApi.updateBarcode(orgId, {
      symbology: "code128", // QR is a US-C4 "Later" item
      widthMm: Number(formData.get("widthMm")),
      heightMm: Number(formData.get("heightMm")),
      showCustomer: formData.get("showCustomer") === "on",
      showSampleType: formData.get("showSampleType") === "on",
      showJobNumber: formData.get("showJobNumber") === "on",
      showDate: formData.get("showDate") === "on",
    }),
  );
}

export async function saveLabSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const orgId = await requireAdminOrgId();
  return done(
    await settingsApi.updateLabSettings(orgId, String(formData.get("labId") ?? ""), {
      analystsMayCreateBatches: formData.get("analystsMayCreateBatches") === "on",
      reviewerMustDiffer: formData.get("reviewerMustDiffer") === "on",
    }),
  );
}

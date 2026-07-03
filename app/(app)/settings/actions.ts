"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { settingsApi } from "@/lib/settings";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { decodeSupportSession, SUPPORT_COOKIE } from "@/lib/platform/support-session";
import { effectiveOrgRole } from "@/lib/permissions";
import { getOrgIdByName } from "@/lib/mock-db";

export type SettingsFormState = { error?: string; success?: boolean };

// Settings are Admin-only (US-A7 authorization). Mock stand-in for the real
// server-side enforcement (invariant 4).
export async function requireAdminOrgId(): Promise<string> {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  const supportSession = decodeSupportSession(cookieStore.get(SUPPORT_COOKIE)?.value);
  if (effectiveOrgRole(session.user, supportSession) !== "admin") redirect("/");
  const orgId = supportSession?.orgId ?? getOrgIdByName(session.user.organisation);
  if (!orgId) redirect("/");
  return orgId;
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
      symbology: formData.get("symbology") === "qr" ? "qr" : "code128",
      widthMm: Number(formData.get("widthMm")),
      heightMm: Number(formData.get("heightMm")),
      showJobNumber: formData.get("showJobNumber") === "on",
      showClient: formData.get("showClient") === "on",
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

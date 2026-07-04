"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { authApi } from "@/lib/auth";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { activeLabsForUser, LAB_COOKIE } from "@/lib/lab";
import { getOrgIdByName, mockDb } from "@/lib/mock-db";

export async function setActiveLabAction(formData: FormData): Promise<void> {
  const labId = String(formData.get("lab") ?? "");
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return;

  // Server-side check (invariant 4): only ACTIVE labs the user is assigned to,
  // validated by id (audit findings 13/33) — and only for a live account in a
  // live org (Fable re-review finding 24). Live state comes from the active
  // auth backend, not the mock store directly.
  const live = await authApi.validateSession(session.user);
  if (!live) return;
  const orgId = getOrgIdByName(live.user.organisation);
  if (!orgId) return;
  if (mockDb.organisations.get(orgId)?.status !== "active") return;
  const labNames =
    live.labs ?? [...mockDb.labs.values()].filter((l) => l.orgId === orgId).map((l) => l.name);
  if (!activeLabsForUser(labNames, orgId).some((l) => l.id === labId)) return;

  cookieStore.set(LAB_COOKIE, labId, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

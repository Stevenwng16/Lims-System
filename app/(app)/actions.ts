"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { activeLabsForUser, LAB_COOKIE } from "@/lib/lab";
import { getOrgIdByName, mockDb } from "@/lib/mock-db";

export async function setActiveLabAction(formData: FormData): Promise<void> {
  const labId = String(formData.get("lab") ?? "");
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return;

  // Server-side check (invariant 4): only ACTIVE labs the user is assigned to,
  // validated by id (audit findings 13/33).
  const user = mockDb.users.get(session.user.email);
  const orgId = getOrgIdByName(session.user.organisation);
  if (!user || !orgId) return;
  if (!activeLabsForUser(user.labs, orgId).some((l) => l.id === labId)) return;

  cookieStore.set(LAB_COOKIE, labId, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

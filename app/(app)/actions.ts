"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { LAB_COOKIE } from "@/lib/lab";
import { mockDb } from "@/lib/mock-db";

export async function setActiveLabAction(formData: FormData): Promise<void> {
  const lab = String(formData.get("lab") ?? "");
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return;

  // Server-side check (invariant 4): only labs the user is assigned to.
  const user = mockDb.users.get(session.user.email);
  if (!user || !user.labs.includes(lab)) return;

  cookieStore.set(LAB_COOKIE, lab, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { decodeSupportSession, SUPPORT_COOKIE } from "@/lib/platform/support-session";
import { platformApi } from "@/lib/platform";

// Server components cannot modify cookies, so lib/auth/context.ts sends dead
// sessions here: this route handler CAN delete the cookies, then forwards to
// /login. Without this, a locked/deactivated user with a live cookie would
// loop "/" ↔ "/login" forever (Fable re-review finding 1).
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const support = decodeSupportSession(cookieStore.get(SUPPORT_COOKIE)?.value);
  if (support) await platformApi.endSupportSession(support.orgId);
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(SUPPORT_COOKIE);
  return NextResponse.redirect(new URL("/login", request.url));
}

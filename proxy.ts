import { NextRequest, NextResponse } from "next/server";
import { decodeSession, encodeSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { decodeSupportSession, SUPPORT_COOKIE } from "@/lib/platform/support-session";

// US-A1 AC 10: unauthenticated users can only reach the login and
// password-reset pages; everything else redirects to /login.
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // The dead-session cleaner must pass through untouched: it deletes the
  // session cookie itself, and the sliding re-issue below must not race that
  // deletion (Fable re-review finding 1).
  if (pathname === "/session-expired") return NextResponse.next();
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (session && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (session) {
    const isPlatformAdmin = session.user.role === "platform-admin";
    const supportSession = decodeSupportSession(request.cookies.get(SUPPORT_COOKIE)?.value);
    // The platform console is vendor-only (US-A2 AC 3/12)…
    if (!isPlatformAdmin && pathname.startsWith("/platform")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    // …and vendor staff live there; the customer environment is only
    // reachable through an active, customer-granted support session (AC 10).
    if (isPlatformAdmin && !pathname.startsWith("/platform") && !supportSession) {
      return NextResponse.redirect(new URL("/platform", request.url));
    }
  }

  const response = NextResponse.next();
  if (session) {
    // Sliding inactivity window (AC 8): re-issue the cookie on every request.
    response.cookies.set(SESSION_COOKIE, encodeSession(session.user), sessionCookieOptions);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};

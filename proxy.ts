import { NextRequest, NextResponse } from "next/server";
import { decodeSession, encodeSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

// US-A1 AC 10: unauthenticated users can only reach the login and
// password-reset pages; everything else redirects to /login.
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (session && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
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

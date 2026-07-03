import type { SessionUser } from "./types";

// Mock-grade session: base64url JSON in an httpOnly cookie with a sliding
// 30-minute expiry (US-A1 AC 8; the timeout becomes org-configurable via
// US-A7). NOT tamper-proof — replaced wholesale when the real backend lands.
// Pure functions only, so both middleware (edge) and server actions can use them.

export const SESSION_COOKIE = "lims_session";
export const SESSION_TTL_MS = 30 * 60 * 1000;

export type Session = { user: SessionUser; expiresAt: number };

export function encodeSession(user: SessionUser): string {
  const session: Session = { user, expiresAt: Date.now() + SESSION_TTL_MS };
  return Buffer.from(JSON.stringify(session)).toString("base64url");
}

export function decodeSession(value: string | undefined): Session | null {
  if (!value) return null;
  try {
    const session = JSON.parse(Buffer.from(value, "base64url").toString()) as Session;
    if (!session.user?.email || typeof session.expiresAt !== "number") return null;
    if (session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
} as const;

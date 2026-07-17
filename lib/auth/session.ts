import type { SessionUser } from "./types";

// Mock-grade session: base64url JSON in an httpOnly cookie with a sliding
// expiry (US-A1 AC 8). NOT tamper-proof — replaced wholesale when the real
// backend lands. Pure functions only, so both middleware (edge) and server
// actions can use them — org settings are therefore NOT read here: the TTL is
// resolved at LOGIN (lib/auth/ttl.ts, per-org sessionTimeoutMinutes — wired
// 17 Jul 2026), embedded in the payload, and re-used by every sliding
// renewal in proxy.ts. A changed setting applies from the next login.

export const SESSION_COOKIE = "lims_session";

/** Platform staff (no org) default — also the fallback for legacy cookies
 * issued before the TTL was embedded. */
export const PLATFORM_SESSION_TTL_MS = 30 * 60 * 1000;

// Bounds mirror the settings validation (5–480 minutes, lib/settings/mock.ts)
// so a malformed or tampered payload can never yield an absurd lifetime.
const MIN_TTL_MS = 5 * 60 * 1000;
const MAX_TTL_MS = 480 * 60 * 1000;

export type Session = { user: SessionUser; expiresAt: number; ttlMs: number };

function clampTtl(ttlMs: number): number {
  if (!Number.isFinite(ttlMs)) return PLATFORM_SESSION_TTL_MS;
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, ttlMs));
}

export function encodeSession(user: SessionUser, ttlMs: number = PLATFORM_SESSION_TTL_MS): string {
  const ttl = clampTtl(ttlMs);
  const session: Session = { user, expiresAt: Date.now() + ttl, ttlMs: ttl };
  return Buffer.from(JSON.stringify(session)).toString("base64url");
}

export function decodeSession(value: string | undefined): Session | null {
  if (!value) return null;
  try {
    const session = JSON.parse(Buffer.from(value, "base64url").toString()) as Session;
    if (!session.user?.email || typeof session.expiresAt !== "number") return null;
    if (session.expiresAt < Date.now()) return null;
    return { ...session, ttlMs: clampTtl(session.ttlMs) };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(ttlMs: number = PLATFORM_SESSION_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: clampTtl(ttlMs) / 1000,
  } as const;
}

import { getOrgIdByName, getOrgSettings } from "@/lib/mock-db";
import { PLATFORM_SESSION_TTL_MS } from "./session";
import type { SessionUser } from "./types";

// Server-side TTL resolution (17 Jul 2026 — wires US-A7's
// sessionTimeoutMinutes to the actual session lifetime). Lives OUTSIDE
// lib/auth/session.ts on purpose: session.ts is imported by the middleware
// (proxy.ts), which must never pull in the store — the middleware worker has
// its own globalThis and would read a DIFFERENT store instance. The resolved
// TTL is embedded in the session payload at login; sliding renewals re-use it.

export function sessionTtlMsFor(user: SessionUser): number {
  // Platform staff belong to no organisation: fixed platform default —
  // never one tenant's customer-editable setting (same rule as the security
  // policy fallback in lib/auth/mock.ts).
  if (user.role === "platform-admin") return PLATFORM_SESSION_TTL_MS;
  const orgId = getOrgIdByName(user.organisation);
  if (!orgId) return PLATFORM_SESSION_TTL_MS;
  return getOrgSettings(orgId).security.sessionTimeoutMinutes * 60_000;
}

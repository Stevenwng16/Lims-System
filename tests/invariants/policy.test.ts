import { describe, expect, test } from "vitest";
import { authApi } from "@/lib/auth";
import { passwordPolicyError } from "@/lib/auth/password";
import { decodeSession, encodeSession, PLATFORM_SESSION_TTL_MS, sessionCookieOptions } from "@/lib/auth/session";
import { sessionTtlMsFor } from "@/lib/auth/ttl";
import { getOrgSettings } from "@/lib/mock-db";
import { makeOrg } from "../helpers";

// Items 2 + 3 of the 17 Jul 2026 gap closure: the session TTL respects the
// org setting, and weak passwords are rejected when requireComplexity is on.

describe("session TTL from org settings", () => {
  test("the org's sessionTimeoutMinutes drives issue, payload and cookie maxAge", async () => {
    const { orgId, orgName, adminEmail } = await makeOrg();
    getOrgSettings(orgId).security.sessionTimeoutMinutes = 45;
    const user = { email: adminEmail, name: "t", organisation: orgName, role: "admin" as const };

    const ttl = sessionTtlMsFor(user);
    expect(ttl).toBe(45 * 60_000);

    const session = decodeSession(encodeSession(user, ttl))!;
    expect(session.ttlMs).toBe(45 * 60_000);
    expect(Math.abs(session.expiresAt - Date.now() - ttl)).toBeLessThan(2000);
    expect(sessionCookieOptions(ttl).maxAge).toBe(45 * 60);

    // Sliding renewal (what proxy.ts does) keeps the embedded TTL.
    expect(decodeSession(encodeSession(session.user, session.ttlMs))!.ttlMs).toBe(45 * 60_000);
  });

  test("platform staff keep the 30-minute default; malformed TTLs clamp", async () => {
    const vendor = { email: "vendor@lims.dev", name: "v", organisation: "LIMS Platform", role: "platform-admin" as const };
    expect(sessionTtlMsFor(vendor)).toBe(PLATFORM_SESSION_TTL_MS);

    const forged = Buffer.from(
      JSON.stringify({ user: vendor, expiresAt: Date.now() + 60_000, ttlMs: 1e12 }),
    ).toString("base64url");
    expect(decodeSession(forged)!.ttlMs).toBe(480 * 60_000);

    const legacy = Buffer.from(
      JSON.stringify({ user: vendor, expiresAt: Date.now() + 60_000 }),
    ).toString("base64url");
    expect(decodeSession(legacy)!.ttlMs).toBe(PLATFORM_SESSION_TTL_MS);
  });
});

describe("password complexity", () => {
  const on = { minPasswordLength: 12, requireComplexity: true };
  const off = { minPasswordLength: 12, requireComplexity: false };

  test("3-of-4 character classes on top of min length", () => {
    expect(passwordPolicyError("Ab1!", on)).not.toBeNull(); // too short
    expect(passwordPolicyError("aaaaaaaaaaaaaaaa", on)).not.toBeNull(); // 1 class
    expect(passwordPolicyError("aaaaaaaaaaaa1", on)).not.toBeNull(); // 2 classes
    expect(passwordPolicyError("aaaaaaaaaaA1", on)).toBeNull(); // 3 classes
    expect(passwordPolicyError("aaaaaaaaaA1!", on)).toBeNull(); // 4 classes
    expect(passwordPolicyError("aaaaaaaaaaaaaaaa", off)).toBeNull(); // off → length only
  });

  test("the reset flow enforces the policy end to end", async () => {
    const weak = await authApi.resetPassword("demo-reset-token", "aaaaaaaaaaaaaaaa");
    expect(weak.status).not.toBe("success");
    const strong = await authApi.resetPassword("demo-reset-token", "Sterk-Wachtwoord-2026");
    expect(strong.status).toBe("success");
    const policy = await authApi.passwordPolicy();
    expect(policy.requireComplexity).toBe(true);
    expect(policy.minLength).toBeGreaterThanOrEqual(12);
  });
});

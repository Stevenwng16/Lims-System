import { defaultOrgSettings, mockDb, type MockOrganisation } from "@/lib/mock-db";
import type { ActionResult, PlatformApi } from "./types";

function grantIsActive(org: MockOrganisation): boolean {
  return !!org.supportGrant && org.supportGrant.expiresAt > Date.now();
}

function sessionIsLive(org: MockOrganisation): boolean {
  const at = org.supportGrant?.sessionExpiresAt;
  return typeof at === "number" && at > Date.now();
}

function userCountOf(orgId: string): number {
  return [...mockDb.users.values()].filter((u) => u.orgId === orgId).length;
}

export const mockPlatformApi: PlatformApi = {
  async listOrganisations() {
    // Expired grants read as "no grant" everywhere.
    for (const org of mockDb.organisations.values()) {
      if (org.supportGrant && !grantIsActive(org)) org.supportGrant = null;
    }
    return [...mockDb.organisations.values()].map((org) => ({
      ...org,
      userCount: userCountOf(org.id), // derived live (finding 9)
      supportSessionActive: sessionIsLive(org), // derived from timestamp (finding 27)
    }));
  },

  async provisionOrganisation(name, adminEmail): Promise<ActionResult> {
    const trimmed = name.trim();
    if (!trimmed) return { status: "error", message: "Organisation name is required." };
    if (!adminEmail.includes("@")) {
      return { status: "error", message: "Enter a valid email address for the first administrator." };
    }
    const exists = [...mockDb.organisations.values()].some(
      (o) => o.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) return { status: "error", message: "An organisation with this name already exists." };

    // Identity is decoupled from the name so two names that slugify the same
    // can never overwrite an existing tenant (audit finding 8 — invariants 2/5).
    const id = `org-${crypto.randomUUID()}`;
    mockDb.organisations.set(id, {
      id,
      name: trimmed,
      status: "active",
      subscription: "trial",
      createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      setupPending: true, // until the invited admin completes setup (AC 4)
      supportGrant: null,
    });
    // US-A2 AC 5 / US-A7 AC 1: settings seeded with safe defaults.
    mockDb.orgSettings.set(id, defaultOrgSettings());
    // US-A5 AC 8: one default lab is seeded so the organisation is immediately
    // usable and the last-active-lab rule holds from day one.
    mockDb.labs.set(`lab-${id}-main`, {
      id: `lab-${id}-main`,
      orgId: id,
      name: "Main lab",
      code: "MAIN",
      description: "",
      status: "active",
      equipmentCount: 0,
      hasActiveWork: false,
      analystsMayCreateBatches: false,
      reviewerMustDiffer: false,
    });
    console.log(`[mock platform] setup invitation sent to ${adminEmail} for "${trimmed}" (AC 4/5: seeded defaults applied)`);
    return { status: "success" };
  },

  async suspendOrganisation(orgId, reason): Promise<ActionResult> {
    const org = mockDb.organisations.get(orgId);
    if (!org) return { status: "error", message: "Unknown organisation." };
    if (!reason.trim()) return { status: "error", message: "A reason is required." };
    org.status = "suspended";
    org.statusReason = reason.trim();
    return { status: "success" };
  },

  async reactivateOrganisation(orgId, reason): Promise<ActionResult> {
    const org = mockDb.organisations.get(orgId);
    if (!org) return { status: "error", message: "Unknown organisation." };
    if (!reason.trim()) return { status: "error", message: "A reason is required." };
    org.status = "active";
    org.statusReason = reason.trim();
    return { status: "success" };
  },

  async getSupportGrant(orgId) {
    const org = mockDb.organisations.get(orgId);
    if (!org?.supportGrant || !grantIsActive(org)) return null;
    return org.supportGrant;
  },

  async grantSupportAccess(orgId, durationHours, allowAdmin): Promise<ActionResult> {
    const org = mockDb.organisations.get(orgId);
    if (!org) return { status: "error", message: "Unknown organisation." };
    // Defense in depth against a tampered POST (audit finding 10).
    if (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 168) {
      return { status: "error", message: "Invalid grant duration." };
    }
    org.supportGrant = {
      grantedAt: Date.now(),
      expiresAt: Date.now() + durationHours * 3600_000,
      allowAdmin,
      sessionExpiresAt: null,
    };
    return { status: "success" };
  },

  async revokeSupportAccess(orgId): Promise<ActionResult> {
    const org = mockDb.organisations.get(orgId);
    if (!org) return { status: "error", message: "Unknown organisation." };
    // Nulling the grant makes getSupportGrant return null, so every request-
    // path resolver (lib/auth/context.ts) drops the vendor's access at once —
    // the revoke is genuinely instant, not cookie-lifetime (audit finding 5).
    org.supportGrant = null;
    return { status: "success" };
  },

  async openSupportSession(orgId) {
    const org = mockDb.organisations.get(orgId);
    if (!org) return { status: "error", message: "Unknown organisation." };
    if (!org.supportGrant || !grantIsActive(org)) {
      // AC 10: without an active grant there is no way in.
      return { status: "error", message: "No active support grant for this organisation." };
    }
    // Session liveness capped to the grant (never outlives it).
    org.supportGrant.sessionExpiresAt = Math.min(
      Date.now() + 8 * 3600_000,
      org.supportGrant.expiresAt,
    );
    return {
      status: "success",
      orgName: org.name,
      allowAdmin: org.supportGrant.allowAdmin,
      grantExpiresAt: org.supportGrant.expiresAt,
    };
  },

  async endSupportSession(orgId): Promise<ActionResult> {
    const org = mockDb.organisations.get(orgId);
    if (org?.supportGrant) org.supportGrant.sessionExpiresAt = null;
    return { status: "success" };
  },
};

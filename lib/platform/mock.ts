import {
  defaultOrgSettings,
  DEMO_PASSWORD,
  mockDb,
  seedDefaultEquipmentTypes,
  type MockOrganisation,
} from "@/lib/mock-db";
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

// US-A2 AC 3: every platform action on a tenant is appended to the
// platform-level audit log, attributed to the acting platform admin
// (invariants 1/6). org.statusReason only mirrors the CURRENT reason for
// display; the reconstructable history lives here (invariant 2).
function recordPlatformAction(by: string, orgId: string, summary: string): void {
  mockDb.platformAudit.push({
    id: `pev-${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    by,
    orgId,
    summary,
  });
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

  async provisionOrganisation(name, adminEmail, actorEmail): Promise<ActionResult> {
    const trimmed = name.trim();
    if (!trimmed) return { status: "error", message: "Organisation name is required." };
    if (!adminEmail.includes("@")) {
      return { status: "error", message: "Enter a valid email address for the first administrator." };
    }
    const exists = [...mockDb.organisations.values()].some(
      (o) => o.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) return { status: "error", message: "An organisation with this name already exists." };
    // The first admin ACCOUNT is created below — validate its email is free
    // BEFORE anything mutates (US-A6 AC 11: unique across the platform).
    const email = adminEmail.trim().toLowerCase();
    if (mockDb.users.has(email)) {
      return { status: "error", message: "An account with this email address already exists." };
    }

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
    // NO default lab is seeded (13 Jul 2026 decision, reversing US-A5 AC 8's
    // 1 Jul call after the first real usability test — Notion amendment
    // pending): the lab CODE is stamped into every job/batch identifier
    // forever, so a placeholder "MAIN" would mint synthetic identity into
    // accredited records. Instead the invited admin lands on the first-run
    // setup screen and creates the real first lab — which completes setup
    // (org.setupPending) and assigns them to it (lib/labs/mock.ts createLab).
    // US-B3 AC 2: the configurable equipment-type list starts with safe
    // defaults, like every other provisioned list (US-A2 AC 5).
    seedDefaultEquipmentTypes(id);
    // AC 4: the invited first admin gets a real ACCOUNT (previously only a
    // console line was printed, so a freshly provisioned organisation had no
    // way to log in at all). Mock stand-in for the invite flow: the password
    // is preset to the demo password, same convention as createUser (US-A6);
    // the real backend sends a set-your-password invitation instead.
    mockDb.users.set(email, {
      email,
      // No name is collected at provisioning — the email's local part is a
      // readable placeholder the admin can correct via user management.
      name: email.split("@")[0],
      organisation: trimmed,
      role: "admin",
      orgId: id,
      // No lab assignment yet — the org has no labs until first-run setup;
      // creating the first lab assigns its creator (see createLab).
      labs: [],
      clearances: [],
      status: "active",
      lastLogin: null,
      password: DEMO_PASSWORD,
      mfaRequired: false,
      failedAttempts: 0,
      locked: false,
      // US-A6 AC 12: the account's audit trail starts at provisioning,
      // attributed to the acting platform admin (invariant 6).
      events: [
        {
          id: `uev-${crypto.randomUUID()}`,
          at: new Date().toISOString(),
          by: actorEmail,
          summary: `Account created by organisation provisioning (first administrator of "${trimmed}")`,
        },
      ],
    });
    recordPlatformAction(
      actorEmail,
      id,
      `Organisation "${trimmed}" provisioned — first administrator invited (${email})`,
    );
    console.log(
      `[mock platform] setup invitation sent to ${email} for "${trimmed}" ` +
        `(AC 4/5: seeded defaults applied; mock: password preset to ${DEMO_PASSWORD})`,
    );
    return { status: "success" };
  },

  async suspendOrganisation(orgId, reason, actorEmail): Promise<ActionResult> {
    const org = mockDb.organisations.get(orgId);
    if (!org) return { status: "error", message: "Unknown organisation." };
    if (!reason.trim()) return { status: "error", message: "A reason is required." };
    // Only active → suspended: suspending a deactivated org would silently
    // erase its deactivation (the UI only offers Suspend on active orgs; this
    // is the server-side guard, invariant 4).
    if (org.status !== "active") {
      return {
        status: "error",
        message:
          org.status === "suspended"
            ? "This organisation is already suspended."
            : "A deactivated organisation cannot be suspended — reactivate it first.",
      };
    }
    org.status = "suspended";
    org.statusReason = reason.trim();
    recordPlatformAction(actorEmail, orgId, `Organisation suspended — reason: ${reason.trim()}`);
    return { status: "success" };
  },

  async reactivateOrganisation(orgId, reason, actorEmail): Promise<ActionResult> {
    const org = mockDb.organisations.get(orgId);
    if (!org) return { status: "error", message: "Unknown organisation." };
    if (!reason.trim()) return { status: "error", message: "A reason is required." };
    if (org.status === "active") {
      return { status: "error", message: "This organisation is already active." };
    }
    // The audit entry names the state being left, so "reactivated from
    // deactivated" stays distinguishable from a lifted suspension.
    const from = org.status;
    org.status = "active";
    org.statusReason = reason.trim();
    recordPlatformAction(
      actorEmail,
      orgId,
      `Organisation reactivated (was ${from}) — reason: ${reason.trim()}`,
    );
    return { status: "success" };
  },

  async deactivateOrganisation(orgId, reason, actorEmail): Promise<ActionResult> {
    const org = mockDb.organisations.get(orgId);
    if (!org) return { status: "error", message: "Unknown organisation." };
    if (org.status === "deactivated") {
      return { status: "error", message: "This organisation is already deactivated." };
    }
    // Deactivate, NEVER delete (US-A2 AC 1 / invariant 2): the org, its users
    // and all domain data stay — the org just leaves the active set. Every
    // login/support gate already refuses a non-active org, so this fully locks
    // it out; ending any live support grant makes that explicit (a deactivated
    // org must not carry vendor access). Reactivatable, like a suspended org.
    if (!reason.trim()) return { status: "error", message: "A reason is required." };
    const grantEnded = grantIsActive(org);
    org.status = "deactivated";
    org.statusReason = reason.trim();
    org.supportGrant = null;
    recordPlatformAction(
      actorEmail,
      orgId,
      `Organisation deactivated — reason: ${reason.trim()}` +
        (grantEnded ? " (live support grant ended)" : ""),
    );
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

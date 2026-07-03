import { mockDb, type MockOrganisation } from "@/lib/mock-db";
import type { ActionResult, PlatformApi } from "./types";

function grantIsActive(org: MockOrganisation): boolean {
  return !!org.supportGrant && org.supportGrant.expiresAt > Date.now();
}

export const mockPlatformApi: PlatformApi = {
  async listOrganisations() {
    // Expired grants read as "no grant" everywhere.
    for (const org of mockDb.organisations.values()) {
      if (org.supportGrant && !grantIsActive(org)) org.supportGrant = null;
    }
    return [...mockDb.organisations.values()];
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

    const id = `org-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    mockDb.organisations.set(id, {
      id,
      name: trimmed,
      status: "active",
      subscription: "trial",
      createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      userCount: 1, // the seeded admin (US-A1 AC 11)
      setupPending: true, // until the invited admin completes setup (AC 4)
      supportGrant: null,
    });
    // US-A5 AC 8: one default lab is seeded so the organisation is immediately
    // usable and the last-active-lab rule holds from day one.
    mockDb.labs.set(`lab-${id}-main`, {
      id: `lab-${id}-main`,
      orgId: id,
      name: "Main lab",
      code: "MAIN",
      description: "",
      status: "active",
      methodCount: 0,
      equipmentCount: 0,
      hasActiveWork: false,
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
    org.supportGrant = {
      grantedAt: Date.now(),
      expiresAt: Date.now() + durationHours * 3600_000,
      allowAdmin,
      sessionActive: false,
    };
    return { status: "success" };
  },

  async revokeSupportAccess(orgId): Promise<ActionResult> {
    const org = mockDb.organisations.get(orgId);
    if (!org) return { status: "error", message: "Unknown organisation." };
    org.supportGrant = null; // also ends any active session (AC 8: revocable at any time)
    return { status: "success" };
  },

  async openSupportSession(orgId) {
    const org = mockDb.organisations.get(orgId);
    if (!org) return { status: "error", message: "Unknown organisation." };
    if (!org.supportGrant || !grantIsActive(org)) {
      // AC 10: without an active grant there is no way in.
      return { status: "error", message: "No active support grant for this organisation." };
    }
    org.supportGrant.sessionActive = true;
    return { status: "success", orgName: org.name, allowAdmin: org.supportGrant.allowAdmin };
  },

  async endSupportSession(orgId): Promise<ActionResult> {
    const org = mockDb.organisations.get(orgId);
    if (org?.supportGrant) org.supportGrant.sessionActive = false;
    return { status: "success" };
  },
};

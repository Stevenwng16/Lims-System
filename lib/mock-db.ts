import type { SessionUser } from "./auth/types";

// Single in-memory store behind all mock APIs (auth + platform), so state is
// consistent across flows (e.g. suspending an org blocks its users' logins).
// Survives HMR via globalThis; resets on dev-server restart.

export type OrgStatus = "active" | "suspended" | "deactivated";
export type SubscriptionStatus = "trial" | "active" | "suspended" | "ended";

export type SupportGrant = {
  grantedAt: number;
  expiresAt: number;
  allowAdmin: boolean;
  sessionActive: boolean;
};

export type MockOrganisation = {
  id: string;
  name: string;
  status: OrgStatus;
  statusReason?: string;
  subscription: SubscriptionStatus;
  createdAt: string;
  userCount: number;
  setupPending: boolean;
  supportGrant: SupportGrant | null;
};

export type MockLab = {
  id: string;
  orgId: string; // a lab belongs to exactly one organisation (invariant 5)
  name: string;
  code: string; // short code used in IDs/labels; unique within the organisation
  description: string;
  status: "active" | "inactive";
  // Mock counts/flags until methods (US-B1), equipment (US-B3) and jobs/
  // batches (epics C/D) are real:
  methodCount: number;
  equipmentCount: number;
  hasActiveWork: boolean; // blocks deactivation (US-A5 AC 5)
};

export type MockUser = SessionUser & {
  orgId: string | null; // null for platform (vendor) staff
  labs: string[]; // lab assignment proper arrives with US-A5/A6
  clearances: string[]; // method clearances (US-A4 AC 6; editable via US-A6)
  password: string;
  mfaRequired: boolean;
  failedAttempts: number;
  locked: boolean;
};

export type MockDb = {
  organisations: Map<string, MockOrganisation>;
  users: Map<string, MockUser>;
  labs: Map<string, MockLab>;
};

export const DEMO_PASSWORD = "LabDemo2026!!";

function seedDb(): MockDb {
  const organisations = new Map<string, MockOrganisation>();
  organisations.set("org-demolab", {
    id: "org-demolab",
    name: "Demo Lab",
    status: "active",
    subscription: "active",
    createdAt: "12 May 2026",
    userCount: 2,
    setupPending: false,
    supportGrant: null,
  });
  organisations.set("org-labalpha", {
    id: "org-labalpha",
    name: "Lab Alpha BV",
    status: "active",
    subscription: "trial",
    createdAt: "24 Jun 2026",
    userCount: 5,
    setupPending: false,
    supportGrant: {
      grantedAt: Date.now() - 24 * 3600_000,
      expiresAt: Date.now() + 48 * 3600_000,
      allowAdmin: false,
      sessionActive: false,
    },
  });
  organisations.set("org-oldcust", {
    id: "org-oldcust",
    name: "OldCust BV",
    status: "suspended",
    statusReason: "Non-payment (mock seed)",
    subscription: "ended",
    createdAt: "3 Feb 2026",
    userCount: 3,
    setupPending: false,
    supportGrant: null,
  });

  const users = new Map<string, MockUser>();
  const base = { password: DEMO_PASSWORD, failedAttempts: 0, locked: false };
  users.set("admin@demolab.nl", {
    ...base,
    email: "admin@demolab.nl",
    name: "Alex Admin",
    organisation: "Demo Lab",
    role: "admin",
    orgId: "org-demolab",
    labs: ["Metals", "Water"], // two labs → lab switcher visible (US-A3 AC 4)
    clearances: [],
    mfaRequired: false,
  });
  users.set("labmanager@demolab.nl", {
    ...base,
    email: "labmanager@demolab.nl",
    name: "Lisa Manager",
    organisation: "Demo Lab",
    role: "lab-manager",
    orgId: "org-demolab",
    labs: ["Metals"],
    clearances: [],
    mfaRequired: false,
  });
  users.set("analyst@demolab.nl", {
    ...base,
    email: "analyst@demolab.nl",
    name: "Sam Analyst",
    organisation: "Demo Lab",
    role: "analyst",
    orgId: "org-demolab",
    labs: ["Metals"], // one lab → name only, no switcher
    clearances: ["pH (M-001)", "Metals by ICP-MS (M-014)"],
    mfaRequired: true,
  });
  users.set("readonly@demolab.nl", {
    ...base,
    email: "readonly@demolab.nl",
    name: "Rob Reader",
    organisation: "Demo Lab",
    role: "read-only",
    orgId: "org-demolab",
    labs: ["Metals"],
    clearances: [],
    mfaRequired: false,
  });
  users.set("user@oldcust.nl", {
    ...base,
    email: "user@oldcust.nl",
    name: "Olga Oldcust",
    organisation: "OldCust BV",
    role: "read-only",
    orgId: "org-oldcust",
    labs: ["General"],
    clearances: [],
    mfaRequired: false,
  });
  users.set("vendor@lims.dev", {
    ...base,
    email: "vendor@lims.dev",
    name: "Vera Vendor",
    organisation: "LIMS Platform",
    role: "platform-admin",
    orgId: null,
    labs: [],
    clearances: [],
    mfaRequired: false,
  });

  const labs = new Map<string, MockLab>();
  labs.set("lab-met", {
    id: "lab-met",
    orgId: "org-demolab",
    name: "Metals",
    code: "MET",
    description: "Metals analysis, ground floor",
    status: "active",
    methodCount: 8,
    equipmentCount: 15,
    hasActiveWork: true, // demo: deactivation is blocked (AC 5)
  });
  labs.set("lab-wat", {
    id: "lab-wat",
    orgId: "org-demolab",
    name: "Water",
    code: "WAT",
    description: "Water & soil testing, 2nd floor",
    status: "active",
    methodCount: 4,
    equipmentCount: 9,
    hasActiveWork: false, // demo: can be deactivated (and reactivated)
  });
  labs.set("lab-ext", {
    id: "lab-ext",
    orgId: "org-demolab",
    name: "External site",
    code: "EXT",
    description: "Sampling location Rotterdam",
    status: "inactive",
    methodCount: 2,
    equipmentCount: 4,
    hasActiveWork: false,
  });
  // Seeded default labs of the other organisations (US-A5 AC 8).
  labs.set("lab-alpha-main", {
    id: "lab-alpha-main",
    orgId: "org-labalpha",
    name: "Main lab",
    code: "MAIN",
    description: "",
    status: "active",
    methodCount: 3,
    equipmentCount: 6,
    hasActiveWork: false,
  });
  labs.set("lab-oldcust-main", {
    id: "lab-oldcust-main",
    orgId: "org-oldcust",
    name: "Main lab",
    code: "MAIN",
    description: "",
    status: "active",
    methodCount: 1,
    equipmentCount: 2,
    hasActiveWork: false,
  });

  return { organisations, users, labs };
}

export const mockDb: MockDb = ((globalThis as Record<string, unknown>).__limsMockDbV4 ??=
  seedDb()) as MockDb;

export function getOrgIdByName(name: string): string | null {
  for (const org of mockDb.organisations.values()) {
    if (org.name === name) return org.id;
  }
  return null;
}

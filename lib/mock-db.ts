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
  // Liveness of the vendor's session is DERIVED from a timestamp, never a
  // sticky boolean (audit finding 27): a session left to time out or abandoned
  // stops counting as active automatically.
  sessionExpiresAt: number | null;
};

// userCount is NOT stored — it is derived from the live users map in
// listOrganisations (audit finding 9), like lab/method counts elsewhere.
export type MockOrganisation = {
  id: string;
  name: string;
  status: OrgStatus;
  statusReason?: string;
  subscription: SubscriptionStatus;
  createdAt: string;
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
  statusReason?: string; // required on every status change (invariant 2)
  // Mock counts/flags until equipment (US-B3) and jobs/batches (epics C/D)
  // are real (method counts are computed from real methods since US-B1):
  equipmentCount: number;
  hasActiveWork: boolean; // blocks deactivation (US-A5 AC 5)
  // Per-lab workflow settings (US-A7 AC 6) — enforced via US-A4/US-D6.
  analystsMayCreateBatches: boolean;
  reviewerMustDiffer: boolean;
};

// Organisation-wide settings (US-A7). Seeded with these safe defaults at
// provisioning (US-A2 AC 5) so a fresh organisation works untouched.
export type ListItem = { id: string; name: string; active: boolean };

export type OrgSettings = {
  security: {
    minPasswordLength: number;
    requireComplexity: boolean;
    lockoutThreshold: number;
    sessionTimeoutMinutes: number;
    requireMfa: boolean;
  };
  identifiers: {
    jobFormat: string;
    sampleFormat: string;
    batchFormat: string;
    sequenceReset: "never" | "yearly" | "monthly";
  };
  jobLabel: string;
  sampleTypes: ListItem[];
  resultQualifiers: ListItem[];
  barcode: {
    symbology: "code128" | "qr";
    widthMm: number;
    heightMm: number;
    // The human-readable sample ID can never be switched off (AC 9b).
    showJobNumber: boolean;
    showClient: boolean;
    showDate: boolean;
  };
};

export function defaultOrgSettings(): OrgSettings {
  return {
    security: {
      minPasswordLength: 12,
      requireComplexity: true,
      lockoutThreshold: 5,
      sessionTimeoutMinutes: 30,
      requireMfa: false,
    },
    identifiers: {
      jobFormat: "{LAB}{YY}-{SEQ:00000}",
      sampleFormat: "{JOB}.{SEQ:000}",
      batchFormat: "{LAB}B{YY}-{SEQ:0000}",
      sequenceReset: "yearly",
    },
    jobLabel: "Job",
    sampleTypes: [
      { id: "st-1", name: "Water", active: true },
      { id: "st-2", name: "Soil", active: true },
      { id: "st-3", name: "Sludge", active: true },
    ],
    resultQualifiers: [{ id: "rq-1", name: "n.b.", active: true }],
    barcode: {
      symbology: "code128",
      widthMm: 50,
      heightMm: 25,
      showJobNumber: true,
      showClient: false,
      showDate: true,
    },
  };
}

// NOTE (US-A6 AC 13): the real data model must separate *identity* (email +
// credentials) from *organisation membership* (role, labs, clearances). The
// mock keeps a flat record because it only ever has one membership per
// identity (AC 11) — the split is a backend obligation, not a UI one.
export type MockUser = SessionUser & {
  orgId: string | null; // null for platform (vendor) staff
  labs: string[]; // lab assignments (edited in US-A6)
  clearances: string[]; // method IDs the user is cleared for (US-A4 AC 6; edited in US-A6; ids are stable across method versions/renames)
  status: "active" | "inactive"; // deactivated, never deleted (US-A6 AC 6)
  lastLogin: string | null;
  password: string;
  mfaRequired: boolean;
  failedAttempts: number;
  locked: boolean;
};

// Methods (US-B1). A method belongs to exactly one lab (invariant 5).
// Versioning per AC 9: an unused method is edited in place; a method that has
// been used by batches gets a NEW version on every edit — versions[] is
// append-only and the last entry is current.

export type MethodAnalyte = {
  id: string;
  name: string;
  unit: string | null; // null = explicit "no unit" (AC 11)
  decimals: number; // reporting precision; rounding rule is fixed system-wide (round half up, ADR-4)
  loq: string | null; // reporting limit — stored as a decimal STRING, never a float (CLAUDE.md hard rule)
};

export type MethodStep = {
  id: string;
  name: string;
  // Design hooks, populated later — shaped now so no rework is needed:
  requiredEquipmentTypes: string[]; // US-B3 (AC 8)
  inputValidationRule: string | null; // epic D scope note decides the shape (AC 4)
};

export type TemplateVersion = {
  version: number;
  fileName: string;
  sizeBytes: number;
  sha256: string; // per-version checksum (AC 6 / ADR-4), computed from the real bytes
  uploadedAt: string;
  uploadedBy: string;
  hasResultsSheet: boolean; // standard Results sheet convention (AC 6 / US-D4 AC 14)
};

export type MethodVersion = {
  version: number;
  name: string;
  code: string;
  labId: string;
  description: string;
  accredited: boolean; // AC 7 — field lives here, report logic in epic F
  maxSamplesPerBatch: number; // counts positions incl. QC (AC 5)
  steps: MethodStep[];
  analytes: MethodAnalyte[];
  templateVersion: number | null; // each method version pins exactly one template version (AC 6)
  createdAt: string;
  createdBy: string;
};

export type MockMethod = {
  id: string;
  orgId: string;
  status: "active" | "inactive"; // deactivate, never delete (AC 10)
  statusReason?: string; // required on every status change (invariant 2)
  usedByBatches: boolean; // mock flag until batches are real (epic D)
  versions: MethodVersion[]; // append-only
  templates: TemplateVersion[]; // stored via the central attachment facility (ADR-3) — mocked here
};

export function currentMethodVersion(method: MockMethod): MethodVersion {
  return method.versions[method.versions.length - 1];
}

export type MockDb = {
  organisations: Map<string, MockOrganisation>;
  users: Map<string, MockUser>;
  labs: Map<string, MockLab>;
  orgSettings: Map<string, OrgSettings>;
  methods: Map<string, MockMethod>;
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
    setupPending: false,
    supportGrant: null,
  });
  organisations.set("org-labalpha", {
    id: "org-labalpha",
    name: "Lab Alpha BV",
    status: "active",
    subscription: "trial",
    createdAt: "24 Jun 2026",
    setupPending: false,
    supportGrant: {
      grantedAt: Date.now() - 24 * 3600_000,
      expiresAt: Date.now() + 48 * 3600_000,
      allowAdmin: false,
      sessionExpiresAt: null,
    },
  });
  organisations.set("org-oldcust", {
    id: "org-oldcust",
    name: "OldCust BV",
    status: "suspended",
    statusReason: "Non-payment (mock seed)",
    subscription: "ended",
    createdAt: "3 Feb 2026",
    setupPending: false,
    supportGrant: null,
  });

  const users = new Map<string, MockUser>();
  const base = {
    password: DEMO_PASSWORD,
    failedAttempts: 0,
    locked: false,
    status: "active" as const,
    lastLogin: "2 Jul 2026",
  };
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
    clearances: ["m-ph", "m-icpms"],
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
    lastLogin: null, // never logged in yet → "—" in the users list
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
    equipmentCount: 15,
    hasActiveWork: true, // demo: deactivation is blocked (AC 5)
    analystsMayCreateBatches: false,
    reviewerMustDiffer: false,
  });
  labs.set("lab-wat", {
    id: "lab-wat",
    orgId: "org-demolab",
    name: "Water",
    code: "WAT",
    description: "Water & soil testing, 2nd floor",
    status: "active",
    equipmentCount: 9,
    hasActiveWork: false, // demo: can be deactivated (and reactivated)
    analystsMayCreateBatches: false,
    reviewerMustDiffer: false,
  });
  labs.set("lab-ext", {
    id: "lab-ext",
    orgId: "org-demolab",
    name: "External site",
    code: "EXT",
    description: "Sampling location Rotterdam",
    status: "inactive",
    statusReason: "Site closed for renovation (mock seed)",
    equipmentCount: 4,
    hasActiveWork: false,
    analystsMayCreateBatches: false,
    reviewerMustDiffer: false,
  });
  // Seeded default labs of the other organisations (US-A5 AC 8).
  labs.set("lab-alpha-main", {
    id: "lab-alpha-main",
    orgId: "org-labalpha",
    name: "Main lab",
    code: "MAIN",
    description: "",
    status: "active",
    equipmentCount: 6,
    hasActiveWork: false,
    analystsMayCreateBatches: false,
    reviewerMustDiffer: false,
  });
  labs.set("lab-oldcust-main", {
    id: "lab-oldcust-main",
    orgId: "org-oldcust",
    name: "Main lab",
    code: "MAIN",
    description: "",
    status: "active",
    equipmentCount: 2,
    hasActiveWork: false,
    analystsMayCreateBatches: false,
    reviewerMustDiffer: false,
  });

  const orgSettings = new Map<string, OrgSettings>();
  for (const orgId of organisations.keys()) {
    orgSettings.set(orgId, defaultOrgSettings());
  }

  // Seed methods (US-B1). Seed checksums are placeholders — templates uploaded
  // through the UI get a real SHA-256 computed from the bytes.
  const methods = new Map<string, MockMethod>();
  const seededTemplate = (fileName: string, hasResultsSheet: boolean): TemplateVersion => ({
    version: 1,
    fileName,
    sizeBytes: 24_576,
    sha256: "seed-checksum-no-real-file-0000000000000000000000000000000000000000",
    uploadedAt: "12 May 2026",
    uploadedBy: "admin@demolab.nl",
    hasResultsSheet,
  });
  const step = (id: string, name: string): MethodStep => ({
    id,
    name,
    requiredEquipmentTypes: [],
    inputValidationRule: null,
  });
  methods.set("m-ph", {
    id: "m-ph",
    orgId: "org-demolab",
    status: "active",
    usedByBatches: true, // editing creates version 2 (AC 9 demo)
    templates: [seededTemplate("ph_template.xlsx", false)],
    versions: [
      {
        version: 1,
        name: "pH",
        code: "M-001",
        labId: "lab-met",
        description: "pH in aqueous samples, electrometric",
        accredited: true,
        maxSamplesPerBatch: 20,
        steps: [step("s1", "Sample prep"), step("s2", "Measurement"), step("s3", "Review")],
        analytes: [{ id: "a1", name: "pH", unit: null, decimals: 2, loq: null }],
        templateVersion: 1,
        createdAt: "12 May 2026",
        createdBy: "admin@demolab.nl",
      },
    ],
  });
  methods.set("m-icpms", {
    id: "m-icpms",
    orgId: "org-demolab",
    status: "active",
    usedByBatches: true,
    templates: [seededTemplate("icpms_metals_template.xlsx", true)],
    versions: [
      {
        version: 1,
        name: "Metals by ICP-MS",
        code: "M-014",
        labId: "lab-met",
        description: "Trace metals in water by ICP-MS",
        accredited: true,
        maxSamplesPerBatch: 40,
        steps: [
          step("s1", "Sample prep"),
          step("s2", "Digestion"),
          step("s3", "Measurement"),
          step("s4", "Review"),
          step("s5", "Report"),
        ],
        analytes: [
          { id: "a1", name: "Pb", unit: "mg/L", decimals: 3, loq: "0.010" },
          { id: "a2", name: "Cd", unit: "mg/L", decimals: 3, loq: "0.005" },
          { id: "a3", name: "Zn", unit: "mg/L", decimals: 2, loq: null },
        ],
        templateVersion: 1,
        createdAt: "12 May 2026",
        createdBy: "admin@demolab.nl",
      },
    ],
  });
  methods.set("m-cond", {
    id: "m-cond",
    orgId: "org-demolab",
    status: "active",
    usedByBatches: false, // unused → edits stay version 1 (AC 9 demo)
    templates: [seededTemplate("conductivity_template.xlsx", false)],
    versions: [
      {
        version: 1,
        name: "Conductivity",
        code: "M-002",
        labId: "lab-wat",
        description: "Electrical conductivity at 25 °C",
        accredited: false,
        maxSamplesPerBatch: 30,
        steps: [step("s1", "Measurement"), step("s2", "Review")],
        analytes: [{ id: "a1", name: "Conductivity", unit: "µS/cm", decimals: 1, loq: null }],
        templateVersion: 1,
        createdAt: "2 Jun 2026",
        createdBy: "admin@demolab.nl",
      },
    ],
  });
  methods.set("m-cl", {
    id: "m-cl",
    orgId: "org-demolab",
    status: "inactive", // deactivated method; clearance records stay intact (AC 12)
    statusReason: "Replaced by subcontracted analysis (mock seed)",
    usedByBatches: false,
    templates: [], // no template uploaded yet → visible warning in the UI
    versions: [
      {
        version: 1,
        name: "Chloride by IC",
        code: "M-021",
        labId: "lab-wat",
        description: "Chloride by ion chromatography",
        accredited: false,
        maxSamplesPerBatch: 25,
        steps: [step("s1", "Measurement"), step("s2", "Review")],
        analytes: [{ id: "a1", name: "Chloride", unit: "mg/L", decimals: 1, loq: "0.5" }],
        templateVersion: null,
        createdAt: "20 Jun 2026",
        createdBy: "admin@demolab.nl",
      },
    ],
  });

  return { organisations, users, labs, orgSettings, methods };
}

export const mockDb: MockDb = ((globalThis as Record<string, unknown>).__limsMockDbV9 ??=
  seedDb()) as MockDb;

export function getOrgSettings(orgId: string): OrgSettings {
  let settings = mockDb.orgSettings.get(orgId);
  if (!settings) {
    settings = defaultOrgSettings();
    mockDb.orgSettings.set(orgId, settings);
  }
  return settings;
}

export function getOrgIdByName(name: string): string | null {
  for (const org of mockDb.organisations.values()) {
    if (org.name === name) return org.id;
  }
  return null;
}

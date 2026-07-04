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
  // Partly-mock flag: since US-D1 the deactivation guard ALSO checks real
  // open batches; this flag still stands in for other in-progress work until
  // the full workflow lands (US-D3/D6). Counts are computed live (US-B1/B3).
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
    symbology: "code128" | "qr"; // QR is a US-C4 "Later" item; only Code 128 is offered
    widthMm: number;
    heightMm: number;
    // The human-readable sample ID can never be switched off (US-C4 AC 5).
    // Default label = ID + customer + type; standalone job number & date off.
    showCustomer: boolean;
    showSampleType: boolean;
    showJobNumber: boolean;
    showDate: boolean;
  };
  equipment: {
    // "Due soon" window for calibration due dates (US-B3 AC 6 — configurable
    // per organisation, invariant 7; default 30 days).
    calibrationWarningDays: number;
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
      showCustomer: true,
      showSampleType: true,
      showJobNumber: false,
      showDate: false,
    },
    equipment: {
      calibrationWarningDays: 30,
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
  usedByBatches: boolean; // set by real batch creation since US-D1 (drives AC 9 versioning)
  versions: MethodVersion[]; // append-only
  templates: TemplateVersion[]; // stored via the central attachment facility (ADR-3) — mocked here
};

export function currentMethodVersion(method: MockMethod): MethodVersion {
  return method.versions[method.versions.length - 1];
}

// Jobs & samples (US-C1). A job belongs to exactly one lab within one
// organisation (invariant 5). Job numbers and sample IDs are generated from the
// US-A7 templates, unique within the organisation, and NEVER changed or
// reissued (AC 2/4). Records are voided with a reason, never deleted (AC 13).

export type Attachment = {
  id: string;
  fileName: string;
  sizeBytes: number;
  sha256: string; // real checksum over the bytes (ADR-3)
  uploadedAt: string;
  uploadedBy: string;
};

export type CustomerConsultation = {
  who: string;
  when: string;
  outcome: string;
  recordedBy: string;
  recordedAt: string;
};

export type SampleAcceptance = "accepted" | "accepted-with-reservation" | "rejected";

// A deviation's TYPE drives whether a customer consultation is forced (AC 8):
// only "mismatch" (does not match description / suitability in doubt) forces it.
export type DeviationType = "none" | "cosmetic" | "mismatch";

// Sample lifecycle status (US-C1 AC 9 / US-D1 AC 4): DERIVED, never stored
// (decision 3 Jul 2026). Per (sample × method) it is computed from open-batch
// membership and batch completion; the sample's single status is the
// aggregate over its requested methods (lib/batches/progress.ts). null = not
// accepted (a rejected sample never enters the lifecycle).
export type SampleLifecycleStatus = "received" | "in-batch" | "in-progress" | "completed";

export type MockSample = {
  id: string; // immutable sample ID (AC 4)
  jobId: string;
  typeId: string; // org sample-type list-item ID (US-A7 AC 9) — stable across renames
  description: string;
  customerSampleRef: string;
  quantity: string; // decimal STRING, never a float (CLAUDE.md hard rule)
  quantityUnit: string;
  requestedMethodIds: string[]; // defaults from the job, overridable (AC 5)
  condition: "conforming" | "deviation"; // §7.4 (AC 6)
  deviationType: DeviationType;
  deviationNote: string;
  attachments: Attachment[]; // optional deviation evidence (AC 6)
  acceptance: SampleAcceptance | null; // §7.4.3 hard gate (AC 7); null = awaiting decision
  reservationReason: string; // required when accepted-with-reservation
  consultation: CustomerConsultation | null; // §7.4.3 (AC 8)
  // NOTE: there is deliberately NO stored lifecycle status — it is derived
  // from batch membership (US-D1 decision 3 Jul 2026, lib/batches/progress.ts).
  storageLocation: string; // §7.4.1 hook (AC 10)
  voided: boolean;
  voidReason?: string;
  createdAt: string;
};

export type MockJob = {
  id: string; // the job number (AC 2) — immutable
  orgId: string;
  labId: string;
  customer: string;
  customerRef: string;
  receivedAt: string; // date + time of receipt (AC 1)
  receivedBy: string; // auto: the registering user
  requestedMethodIds: string[];
  priority: string;
  dueDate: string;
  notes: string;
  storageLocation: string;
  voided: boolean;
  voidReason?: string;
  createdAt: string;
  createdBy: string;
  samples: MockSample[];
};

// Batches (US-D1). A batch belongs to one lab within one organisation
// (invariant 5), is permanently pinned to one method VERSION (AC 1), and its
// number is immutable once issued (AC 2). Composition is guarded by a ONE-WAY
// latch (AC 10): false until the first step-advance or recorded work, then
// true forever — no code path may ever reset it (hard-never list: a set-back
// never reopens composition). US-D3 owns steps/void, US-D4 data, US-D6 review.

export type BatchQcEntry = {
  materialId: string; // the material at its specific lot (US-B2 AC 7)
  quantity: number; // ≥1; each unit occupies a position (AC 6/7)
};

export type MockBatchEvent = {
  id: string;
  at: string; // ISO datetime
  by: string;
  type: "created" | "composition-changed" | "working-copy-generated";
  summary: string;
};

export type MockBatch = {
  id: string; // the batch number (AC 2) — immutable, never reissued
  orgId: string;
  labId: string;
  methodId: string;
  methodVersion: number; // pinned at creation (AC 1) — never changes
  templateVersion: number | null; // the template version that method version pins
  status: "open" | "completed" | "voided"; // void (US-D3) / completion (US-D6)
  voidReason?: string;
  currentStepIndex: number; // 0-based into the PINNED version's steps (AC 9)
  compositionLatched: boolean; // one-way (AC 10) — set true by US-D3/D4, never unset
  sampleIds: string[]; // ordered client samples
  qc: BatchQcEntry[]; // one entry per material, with quantity (AC 7)
  workingCopy: {
    fileName: string;
    sizeBytes: number;
    sha256: string; // ADR-4: checksum recorded at generation
    generatedAt: string;
  } | null;
  reagentLotIds: string[]; // AC 11 design hook — post-MVP story fills it
  events: MockBatchEvent[]; // append-only (AC 13)
  createdAt: string; // ISO datetime — permanently carried (AC 13)
  createdBy: string;
};

// QC materials (US-B2). The three types are FIXED because each carries its own
// comparison behaviour for epic E: Blank → below the method's LOQ (no numeric
// target), Control standard / CRM → value ± tolerance (CRM adds the
// certificate = metrological traceability, §6.5).
export type QcType = "blank" | "control-standard" | "crm";

export type QcTolerance = {
  kind: "absolute" | "percent"; // per analyte (AC 4): CRMs often absolute, standards often %
  value: string; // decimal STRING, never a float (CLAUDE.md hard rule)
};

export type QcExpectedValue = {
  id: string;
  analyteName: string; // free configuration; matched to method analytes by name (ci) + unit (AC 9)
  unit: string | null; // null = explicit "no unit", consistent with US-B1
  expectedValue: string; // decimal STRING
  tolerance: QcTolerance;
};

export type MockQcMaterial = {
  id: string;
  orgId: string;
  labId: string;
  name: string;
  code: string; // matched (case-insensitively) on instrument-import rows (US-D5); unique per lab among ACTIVE materials
  type: QcType;
  supplier: string;
  lotNumber: string; // required for Control standards and CRMs; optional for Blanks (AC 2)
  expiryDate: string; // "yyyy-mm-dd"; required for CS/CRM, optional for Blanks
  certificate: Attachment | null; // via the central attachment facility (ADR-3)
  description: string;
  expectedValues: QcExpectedValue[]; // empty for Blanks (below-limit, no numeric target)
  status: "active" | "inactive"; // deactivate, never delete (AC 8)
  statusReason?: string; // required on every status change (invariant 2; decision 4 Jul 2026)
  createdAt: string;
};

// Equipment (US-B3). A piece of equipment belongs to one lab within one
// organisation (invariant 5). The availability state (Available / Due soon /
// Blocked) is COMPUTED from calibration, checks and the out-of-service flag —
// it is deliberately never a stored column (AC 6), so there is nothing a
// generic "unblock" could flip (AC 7 / hard-never list).

// Configurable per organisation (AC 2); managed by Admins. Deactivate, never
// delete — equipment already of an inactive type keeps it (grandfathering).
export type MockEquipmentType = {
  id: string;
  orgId: string;
  name: string;
  status: "active" | "inactive";
  statusReason?: string; // required on every status change (invariant 2)
};

export type EquipmentCalibration = {
  intervalMonths: number | null;
  lastDate: string | null; // "yyyy-mm-dd"
  // Derived from lastDate + interval, or set manually (AC 3, e.g. taken from
  // the certificate). null = no calibration requirement recorded.
  dueDate: string | null;
  dueDateManual: boolean;
  certificate: Attachment | null; // via the central attachment facility (ADR-3)
};

export type CheckFrequency = "per-use" | "daily" | "weekly";

// AC 4/5: a numeric criterion is evaluated BY THE SYSTEM at logging (Fable
// review amendment 1 Jul 2026); the manual pass/fail choice exists only for
// check types without one. Decimal fields are STRINGS, never floats.
export type CheckCriterion =
  | { kind: "numeric"; expectedValue: string; unit: string | null; tolerance: QcTolerance }
  | { kind: "manual"; description: string };

export type MockCheckType = {
  id: string;
  name: string;
  frequency: CheckFrequency;
  criterion: CheckCriterion;
  // Retired check types stop being required but their logged history stays.
  status: "active" | "inactive";
  statusReason?: string;
};

// Append-only (AC 5): a correction is a NEW entry, never an overwrite. The
// latest entry per check type is the current state (a re-check supersedes).
export type MockCheckEntry = {
  id: string;
  checkTypeId: string;
  performedAt: string; // ISO datetime — set server-side at logging
  performedBy: string; // the logged-in user (invariant 6)
  measuredValue: string | null; // decimal STRING
  result: "pass" | "fail";
  resultComputed: boolean; // true = derived from the numeric criterion (AC 5)
  notes: string;
};

export type EquipmentEventType =
  | "created"
  | "edited"
  | "calibration-updated"
  | "certificate-uploaded"
  | "check-type-added"
  | "check-type-changed"
  | "check-logged"
  | "out-of-service"
  | "returned-to-service"
  | "links-changed"
  | "status-changed";

// Append-only per-equipment history (AC 9/14): late/failed checks, blocked
// causes and both out-of-service directions stay answerable afterwards. The
// real backend mirrors this into the org-wide audit log (invariant 1).
export type MockEquipmentEvent = {
  id: string;
  at: string; // ISO datetime
  by: string;
  type: EquipmentEventType;
  summary: string; // human-readable, includes before → after on edits
};

export type MockEquipment = {
  id: string;
  orgId: string;
  labId: string;
  name: string;
  assetId: string; // unique within the organisation (AC 2/13); never reissued
  typeId: string; // → equipmentTypes
  manufacturer: string;
  model: string;
  serialNumber: string;
  location: string;
  description: string;
  calibration: EquipmentCalibration;
  checkTypes: MockCheckType[];
  checks: MockCheckEntry[]; // append-only (AC 5)
  // Instance-level link to methods / method process steps (AC 10); stepId null
  // = linked to the method as a whole. Fills the US-B1 AC 8 hook; epic D reads
  // the availability state through this relation for gating.
  methodLinks: { methodId: string; stepId: string | null }[];
  outOfService: { reason: string; since: string; by: string } | null; // AC 8
  status: "active" | "inactive"; // deactivate, never delete (AC 11)
  statusReason?: string;
  events: MockEquipmentEvent[]; // append-only (AC 9/14)
  createdAt: string;
};

export type MockDb = {
  organisations: Map<string, MockOrganisation>;
  users: Map<string, MockUser>;
  labs: Map<string, MockLab>;
  orgSettings: Map<string, OrgSettings>;
  methods: Map<string, MockMethod>;
  qcMaterials: Map<string, MockQcMaterial>;
  equipment: Map<string, MockEquipment>;
  equipmentTypes: Map<string, MockEquipmentType>;
  jobs: Map<string, MockJob>;
  // Batches under org-composite keys ("<orgId>:<batchNumber>") like jobs, so an
  // org-unique number can never collide across tenants (invariant 5).
  batches: Map<string, MockBatch>;
  // Generated working-copy bytes (ADR-3 mock), keyed "<orgId>:<batchNumber>".
  // Kept out of the batch record so RSC serialization never ships file bytes.
  batchFiles: Map<string, Uint8Array>;
  // Per-org+per-lab+period job counters and per-job sample counters (US-A7 AC 3
  // sequence isolation). Key formats: "job:<orgId>:<labId>:<period>" and
  // "sample:<orgId>:<jobNumber>". Both org-scoped so tenants never couple.
  sequences: Map<string, number>;
};

export const DEMO_PASSWORD = "LabDemo2026!!";

// Starter equipment-type list seeded at provisioning (US-B3 AC 2 — the list is
// configurable per organisation; these are just safe defaults, US-A2 AC 5).
export const DEFAULT_EQUIPMENT_TYPES = ["Balance", "pH meter", "Thermometer"];

export function seedDefaultEquipmentTypes(orgId: string): void {
  for (const [i, name] of DEFAULT_EQUIPMENT_TYPES.entries()) {
    const id = `eqt-${orgId}-${i}`;
    if (!mockDb.equipmentTypes.has(id)) {
      mockDb.equipmentTypes.set(id, { id, orgId, name, status: "active" });
    }
  }
}

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
    labs: ["Main lab"], // must reference an existing org-oldcust lab (finding 25)
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

  // Seed QC materials (US-B2), all in the Metals lab. "Metals mix 1" covers
  // Pb/Cd/Zn in mg/L — matching m-icpms's analytes by name+unit (AC 9 demo);
  // the CRM's mg/kg units deliberately do NOT match (non-covering example).
  const qcMaterials = new Map<string, MockQcMaterial>();
  qcMaterials.set("qc-cs1", {
    id: "qc-cs1",
    orgId: "org-demolab",
    labId: "lab-met",
    name: "Metals mix 1",
    code: "CS1",
    type: "control-standard",
    supplier: "Acme Standards",
    lotNumber: "MM-2026-A",
    expiryDate: "2027-03-01",
    certificate: null,
    description: "Working control standard for ICP-MS metals",
    expectedValues: [
      { id: "ev1", analyteName: "Pb", unit: "mg/L", expectedValue: "5.0", tolerance: { kind: "absolute", value: "0.3" } },
      { id: "ev2", analyteName: "Cd", unit: "mg/L", expectedValue: "2.0", tolerance: { kind: "percent", value: "5" } },
      { id: "ev3", analyteName: "Zn", unit: "mg/L", expectedValue: "10.0", tolerance: { kind: "absolute", value: "0.5" } },
    ],
    status: "active",
    createdAt: "12 May 2026",
  });
  qcMaterials.set("qc-blk", {
    id: "qc-blk",
    orgId: "org-demolab",
    labId: "lab-met",
    name: "Reagent blank",
    code: "BLK",
    type: "blank",
    supplier: "",
    lotNumber: "", // blanks are often prepared fresh — no lot/expiry (AC 2)
    expiryDate: "",
    certificate: null,
    description: "Fresh-prepared reagent blank",
    expectedValues: [], // below-limit vs the method's LOQ (epic E) — no numeric target
    status: "active",
    createdAt: "12 May 2026",
  });
  qcMaterials.set("qc-crm1", {
    id: "qc-crm1",
    orgId: "org-demolab",
    labId: "lab-met",
    name: "River sediment",
    code: "CRM1",
    type: "crm",
    supplier: "NIST",
    lotNumber: "NIST-2782",
    expiryDate: "2028-11-30",
    certificate: {
      id: "att-cert-crm1",
      fileName: "cert_NIST-2782.pdf",
      sizeBytes: 48_128,
      sha256: "seed-checksum-no-real-file-0000000000000000000000000000000000000000",
      uploadedAt: "12 May 2026",
      uploadedBy: "admin@demolab.nl",
    },
    description: "Certified reference material, sediment matrix",
    expectedValues: [
      { id: "ev1", analyteName: "Pb", unit: "mg/kg", expectedValue: "150.3", tolerance: { kind: "absolute", value: "7.4" } },
      { id: "ev2", analyteName: "Cd", unit: "mg/kg", expectedValue: "4.17", tolerance: { kind: "absolute", value: "0.34" } },
    ],
    status: "active",
    createdAt: "12 May 2026",
  });
  qcMaterials.set("qc-cs2", {
    id: "qc-cs2",
    orgId: "org-demolab",
    labId: "lab-met",
    name: "Cal check standard",
    code: "CS2",
    type: "control-standard",
    supplier: "Acme Standards",
    lotNumber: "CC-2025-B",
    expiryDate: "2026-07-25", // expires within 30 days → "expires soon" flag demo
    certificate: null,
    description: "",
    expectedValues: [
      { id: "ev1", analyteName: "Pb", unit: "mg/L", expectedValue: "1.0", tolerance: { kind: "percent", value: "10" } },
    ],
    status: "active",
    createdAt: "2 Jun 2026",
  });
  qcMaterials.set("qc-cs1-old", {
    id: "qc-cs1-old",
    orgId: "org-demolab",
    labId: "lab-met",
    name: "Metals mix 1",
    code: "CS1", // same code as the active lot — allowed: uniqueness counts ACTIVE materials only
    type: "control-standard",
    supplier: "Acme Standards",
    lotNumber: "MM-2025-D",
    expiryDate: "2026-04-01", // in the past → expired flag demo
    certificate: null,
    description: "Previous lot (retained as its own record, AC 7)",
    expectedValues: [
      { id: "ev1", analyteName: "Pb", unit: "mg/L", expectedValue: "5.1", tolerance: { kind: "absolute", value: "0.3" } },
      { id: "ev2", analyteName: "Cd", unit: "mg/L", expectedValue: "2.1", tolerance: { kind: "percent", value: "5" } },
      { id: "ev3", analyteName: "Zn", unit: "mg/L", expectedValue: "9.8", tolerance: { kind: "absolute", value: "0.5" } },
    ],
    status: "inactive",
    statusReason: "Lot expired; replaced by MM-2026-A (mock seed)",
    createdAt: "3 Nov 2025",
  });

  // Seed equipment (US-B3). Check/calibration dates are partly DYNAMIC so the
  // demo states stay correct whenever the dev server starts: BAL-001 Available
  // (checked today), ICP-01 Due soon (calibration inside the warning window),
  // BAL-002 Blocked (calibration expired + check overdue), PH-03 Blocked (last
  // check failed), OVN-01 Blocked (out of service; inactive type grandfathered),
  // BAL-000 inactive (deactivate-not-delete).
  const isoDay = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * 86400_000).toISOString().slice(0, 10);
  const isoAt = (offsetDays: number, time: string) => `${isoDay(offsetDays)}T${time}`;

  const equipmentTypes = new Map<string, MockEquipmentType>();
  equipmentTypes.set("eqt-bal", { id: "eqt-bal", orgId: "org-demolab", name: "Balance", status: "active" });
  equipmentTypes.set("eqt-icp", { id: "eqt-icp", orgId: "org-demolab", name: "ICP-OES", status: "active" });
  equipmentTypes.set("eqt-ph", { id: "eqt-ph", orgId: "org-demolab", name: "pH meter", status: "active" });
  equipmentTypes.set("eqt-oven", {
    id: "eqt-oven",
    orgId: "org-demolab",
    name: "Muffle furnace",
    status: "inactive",
    statusReason: "Type list cleanup (mock seed) — existing furnace keeps it (grandfathered)",
  });
  for (const orgId of ["org-labalpha", "org-oldcust"]) {
    for (const [i, name] of DEFAULT_EQUIPMENT_TYPES.entries()) {
      const id = `eqt-${orgId}-${i}`;
      equipmentTypes.set(id, { id, orgId, name, status: "active" });
    }
  }

  const balanceCheck = (id: string): MockCheckType => ({
    id,
    name: "Daily check",
    frequency: "daily",
    criterion: {
      kind: "numeric",
      expectedValue: "100.000",
      unit: "g",
      tolerance: { kind: "absolute", value: "0.002" },
    },
    status: "active",
  });
  const checkEvent = (entry: MockCheckEntry, checkName: string): MockEquipmentEvent => ({
    id: `eqev-${entry.id}`,
    at: entry.performedAt,
    by: entry.performedBy,
    type: "check-logged",
    summary: `${checkName}: ${entry.result}${entry.measuredValue ? ` (measured ${entry.measuredValue})` : ""}`,
  });

  const equipment = new Map<string, MockEquipment>();
  // Available — calibrated, daily check passed today. The day-before entries
  // demo the append-only correction path (AC 5): a computed fail is never
  // edited; the re-check is a NEW entry that supersedes it.
  const bal1Checks: MockCheckEntry[] = [
    { id: "chk-b1-1", checkTypeId: "ct-bal1", performedAt: isoAt(-2, "08:05:00.000Z"), performedBy: "analyst@demolab.nl", measuredValue: "100.001", result: "pass", resultComputed: true, notes: "" },
    { id: "chk-b1-2", checkTypeId: "ct-bal1", performedAt: isoAt(-1, "08:10:00.000Z"), performedBy: "analyst@demolab.nl", measuredValue: "100.003", result: "fail", resultComputed: true, notes: "" },
    { id: "chk-b1-3", checkTypeId: "ct-bal1", performedAt: isoAt(-1, "08:25:00.000Z"), performedBy: "analyst@demolab.nl", measuredValue: "100.001", result: "pass", resultComputed: true, notes: "Re-check after cleaning the pan — corrects the 08:10 entry (append-only)." },
    { id: "chk-b1-4", checkTypeId: "ct-bal1", performedAt: isoAt(0, "08:12:00.000Z"), performedBy: "analyst@demolab.nl", measuredValue: "100.000", result: "pass", resultComputed: true, notes: "" },
  ];
  equipment.set("eq-bal001", {
    id: "eq-bal001",
    orgId: "org-demolab",
    labId: "lab-met",
    name: "Analytical balance 1",
    assetId: "BAL-001",
    typeId: "eqt-bal",
    manufacturer: "Mettler Toledo",
    model: "XP205",
    serialNumber: "MT-8842217",
    location: "Weighing room",
    description: "",
    calibration: {
      intervalMonths: 12,
      lastDate: "2026-01-15",
      dueDate: "2027-01-15",
      dueDateManual: false,
      certificate: {
        id: "att-cal-bal001",
        fileName: "cal_BAL-001_2026.pdf",
        sizeBytes: 88_064,
        sha256: "seed-checksum-no-real-file-0000000000000000000000000000000000000000",
        uploadedAt: "15 Jan 2026",
        uploadedBy: "labmanager@demolab.nl",
      },
    },
    checkTypes: [balanceCheck("ct-bal1")],
    checks: bal1Checks,
    methodLinks: [{ methodId: "m-icpms", stepId: "s1" }],
    outOfService: null,
    status: "active",
    events: [
      { id: "eqev-b1-created", at: "2026-01-10T09:00:00.000Z", by: "admin@demolab.nl", type: "created", summary: "Equipment created" },
      { id: "eqev-b1-cal", at: "2026-01-15T14:00:00.000Z", by: "labmanager@demolab.nl", type: "calibration-updated", summary: "last: — → 2026-01-15; due: — → 2027-01-15 (interval 12 months)" },
      ...bal1Checks.map((c) => checkEvent(c, "Daily check")),
    ],
    createdAt: "10 Jan 2026",
  });
  // Due soon — calibration due date inside the (default 30-day) warning window.
  equipment.set("eq-icp01", {
    id: "eq-icp01",
    orgId: "org-demolab",
    labId: "lab-wat",
    name: "ICP-OES",
    assetId: "ICP-01",
    typeId: "eqt-icp",
    manufacturer: "PerkinElmer",
    model: "Avio 550",
    serialNumber: "PE-115508",
    location: "Instrument room 2",
    description: "",
    calibration: {
      intervalMonths: 12,
      lastDate: "2025-07-25",
      dueDate: isoDay(20), // manual due date from the certificate (AC 3)
      dueDateManual: true,
      certificate: null,
    },
    checkTypes: [],
    checks: [],
    methodLinks: [],
    outOfService: null,
    status: "active",
    events: [
      { id: "eqev-i1-created", at: "2025-07-25T10:00:00.000Z", by: "admin@demolab.nl", type: "created", summary: "Equipment created" },
    ],
    createdAt: "25 Jul 2025",
  });
  // Blocked — calibration expired AND the daily check is overdue.
  const bal2Checks: MockCheckEntry[] = [
    { id: "chk-b2-1", checkTypeId: "ct-bal2", performedAt: "2026-06-20T08:30:00.000Z", performedBy: "analyst@demolab.nl", measuredValue: "100.001", result: "pass", resultComputed: true, notes: "" },
  ];
  equipment.set("eq-bal002", {
    id: "eq-bal002",
    orgId: "org-demolab",
    labId: "lab-met",
    name: "Analytical balance 2",
    assetId: "BAL-002",
    typeId: "eqt-bal",
    manufacturer: "Sartorius",
    model: "Cubis II",
    serialNumber: "SA-2201984",
    location: "Weighing room",
    description: "Backup balance",
    calibration: {
      intervalMonths: 12,
      lastDate: "2025-06-10",
      dueDate: "2026-06-10",
      dueDateManual: false,
      certificate: null,
    },
    checkTypes: [balanceCheck("ct-bal2")],
    checks: bal2Checks,
    methodLinks: [{ methodId: "m-icpms", stepId: "s1" }],
    outOfService: null,
    status: "active",
    events: [
      { id: "eqev-b2-created", at: "2025-06-10T09:00:00.000Z", by: "admin@demolab.nl", type: "created", summary: "Equipment created" },
      ...bal2Checks.map((c) => checkEvent(c, "Daily check")),
    ],
    createdAt: "10 Jun 2025",
  });
  // Blocked — last check FAILED (computed from the numeric criterion, AC 5);
  // performing a new check that passes restores it (AC 7).
  const ph3Checks: MockCheckEntry[] = [
    { id: "chk-p3-1", checkTypeId: "ct-ph3", performedAt: isoAt(-2, "09:00:00.000Z"), performedBy: "analyst@demolab.nl", measuredValue: "7.02", result: "pass", resultComputed: true, notes: "" },
    { id: "chk-p3-2", checkTypeId: "ct-ph3", performedAt: isoAt(-1, "09:05:00.000Z"), performedBy: "analyst@demolab.nl", measuredValue: "7.21", result: "fail", resultComputed: true, notes: "Electrode drift suspected." },
  ];
  equipment.set("eq-ph03", {
    id: "eq-ph03",
    orgId: "org-demolab",
    labId: "lab-wat",
    name: "pH meter",
    assetId: "PH-03",
    typeId: "eqt-ph",
    manufacturer: "Metrohm",
    model: "913",
    serialNumber: "MH-771203",
    location: "Bench 4",
    description: "",
    calibration: {
      intervalMonths: 6,
      lastDate: "2026-03-20",
      dueDate: "2026-09-20",
      dueDateManual: false,
      certificate: null,
    },
    checkTypes: [
      {
        id: "ct-ph3",
        name: "Buffer 7.00 check",
        frequency: "daily",
        criterion: {
          kind: "numeric",
          expectedValue: "7.00",
          unit: null,
          tolerance: { kind: "absolute", value: "0.05" },
        },
        status: "active",
      },
    ],
    checks: ph3Checks,
    methodLinks: [{ methodId: "m-cond", stepId: null }],
    outOfService: null,
    status: "active",
    events: [
      { id: "eqev-p3-created", at: "2026-03-20T09:00:00.000Z", by: "admin@demolab.nl", type: "created", summary: "Equipment created" },
      ...ph3Checks.map((c) => checkEvent(c, "Buffer 7.00 check")),
    ],
    createdAt: "20 Mar 2026",
  });
  // Blocked — manually out of service (AC 8), the one human-cleared cause.
  // Its type is inactive: existing equipment keeps it (grandfathered).
  equipment.set("eq-ovn01", {
    id: "eq-ovn01",
    orgId: "org-demolab",
    labId: "lab-met",
    name: "Muffle furnace",
    assetId: "OVN-01",
    typeId: "eqt-oven",
    manufacturer: "Nabertherm",
    model: "L 9/11",
    serialNumber: "NB-40917",
    location: "Ashing room",
    description: "",
    calibration: {
      intervalMonths: null,
      lastDate: null,
      dueDate: null,
      dueDateManual: false,
      certificate: null,
    },
    checkTypes: [],
    checks: [],
    methodLinks: [],
    outOfService: {
      reason: "Heating element failure — awaiting repair",
      since: isoAt(-5, "11:30:00.000Z"),
      by: "labmanager@demolab.nl",
    },
    status: "active",
    events: [
      { id: "eqev-o1-created", at: "2025-02-01T09:00:00.000Z", by: "admin@demolab.nl", type: "created", summary: "Equipment created" },
      { id: "eqev-o1-oos", at: isoAt(-5, "11:30:00.000Z"), by: "labmanager@demolab.nl", type: "out-of-service", summary: "Taken out of service: Heating element failure — awaiting repair" },
    ],
    createdAt: "1 Feb 2025",
  });
  // Inactive — deactivated with a reason, never deleted; history retained (AC 11).
  equipment.set("eq-bal000", {
    id: "eq-bal000",
    orgId: "org-demolab",
    labId: "lab-met",
    name: "Analytical balance 0",
    assetId: "BAL-000",
    typeId: "eqt-bal",
    manufacturer: "Mettler Toledo",
    model: "AG204",
    serialNumber: "MT-0917754",
    location: "Storage",
    description: "Decommissioned 2025",
    calibration: {
      intervalMonths: 12,
      lastDate: "2024-11-20",
      dueDate: "2025-11-20",
      dueDateManual: false,
      certificate: null,
    },
    checkTypes: [],
    checks: [],
    methodLinks: [],
    outOfService: null,
    status: "inactive",
    statusReason: "Replaced by BAL-001 (mock seed)",
    events: [
      { id: "eqev-b0-created", at: "2024-11-20T09:00:00.000Z", by: "admin@demolab.nl", type: "created", summary: "Equipment created" },
      { id: "eqev-b0-status", at: "2026-01-12T09:00:00.000Z", by: "admin@demolab.nl", type: "status-changed", summary: "active → inactive: Replaced by BAL-001 (mock seed)" },
    ],
    createdAt: "20 Nov 2024",
  });

  // Seed one example job (US-C1) so the list/detail have content. Sample types
  // reference the org's seeded sample-type list ids (st-1 Water, st-2 Soil).
  const jobs = new Map<string, MockJob>();
  const sequences = new Map<string, number>();
  const sample = (
    id: string,
    typeId: string,
    description: string,
    extra: Partial<MockSample>,
  ): MockSample => ({
    id,
    jobId: id.split(".")[0],
    typeId,
    description,
    customerSampleRef: "",
    quantity: "",
    quantityUnit: "",
    requestedMethodIds: ["m-icpms"],
    condition: "conforming",
    deviationType: "none",
    deviationNote: "",
    attachments: [],
    acceptance: null,
    reservationReason: "",
    consultation: null,
    storageLocation: "",
    voided: false,
    createdAt: "9 Jun 2026",
    ...extra,
  });
  // Map key is org-composite for tenant isolation (audit findings 1/8/12); the
  // visible id stays the human-readable, org-unique job number.
  jobs.set("org-demolab:MET26-00001", {
    id: "MET26-00001",
    orgId: "org-demolab",
    labId: "lab-met",
    customer: "Aqualab Noord",
    customerRef: "PO-7781",
    receivedAt: "2026-06-09T14:20",
    receivedBy: "labmanager@demolab.nl",
    requestedMethodIds: ["m-icpms"],
    priority: "Standard",
    dueDate: "2026-07-10",
    notes: "",
    storageLocation: "Fridge A, shelf 2",
    voided: false,
    createdAt: "9 Jun 2026",
    createdBy: "labmanager@demolab.nl",
    samples: [
      sample("MET26-00001.001", "st-1", "Inlet", { acceptance: "accepted" }),
      sample("MET26-00001.002", "st-1", "Outlet", {
        condition: "deviation",
        deviationType: "cosmetic",
        deviationNote: "Leaking cap",
        acceptance: "accepted-with-reservation",
        reservationReason: "Minor leakage on receipt; result may be affected.",
      }),
      sample("MET26-00001.003", "st-2", "Bank sediment", {
        condition: "deviation",
        deviationType: "mismatch",
        deviationNote: "Labelled as water but appears to be sediment",
        // Awaiting decision: a mismatch forces a consultation before acceptance.
      }),
    ],
  });
  const metJob = (
    id: string,
    customer: string,
    dueDate: string,
    extra: Partial<MockJob>,
    samples: MockSample[],
  ): MockJob => ({
    id,
    orgId: "org-demolab",
    labId: "lab-met",
    customer,
    customerRef: "",
    receivedAt: "2026-06-20T09:00",
    receivedBy: "labmanager@demolab.nl",
    requestedMethodIds: ["m-icpms"],
    priority: "Standard",
    dueDate,
    notes: "",
    storageLocation: "",
    voided: false,
    createdAt: "20 Jun 2026",
    createdBy: "labmanager@demolab.nl",
    samples,
    ...extra,
  });
  // Not started (samples accepted, still "received"); deadline in the future.
  jobs.set("org-demolab:MET26-00002", metJob("MET26-00002", "BioFoods BV", "2026-07-20", {}, [
    sample("MET26-00002.001", "st-1", "Batch A", { acceptance: "accepted" }),
  ]));
  // In progress + overdue (deadline in the past).
  jobs.set(
    "org-demolab:MET26-00003",
    metJob("MET26-00003", "Stad Rotterdam", "2026-06-25", {}, [
      sample("MET26-00003.001", "st-2", "Site 3", { acceptance: "accepted" }),
    ]),
  );
  // Completed.
  jobs.set(
    "org-demolab:MET26-00004",
    metJob("MET26-00004", "Aqualab Noord", "2026-06-30", {}, [
      sample("MET26-00004.001", "st-1", "Final", { acceptance: "accepted" }),
    ]),
  );
  // Voided (US-C1 AC 13) — hidden by default in the overview (AC 10).
  jobs.set(
    "org-demolab:MET26-00005",
    metJob("MET26-00005", "Test entry", "", { voided: true, voidReason: "Registered in error (seed)" }, [
      sample("MET26-00005.001", "st-1", "X", { acceptance: "accepted" }),
    ]),
  );

  // Seed batches (US-D1) so the derived sample statuses have substance:
  // METB26-0001 is COMPLETED and contains MET26-00004.001 → that sample (and
  // its job) derives "completed"; METB26-0002 is OPEN past step 1 and contains
  // MET26-00003.001 → derives "in-progress". Both latched (work recorded).
  const batches = new Map<string, MockBatch>();
  batches.set("org-demolab:METB26-0001", {
    id: "METB26-0001",
    orgId: "org-demolab",
    labId: "lab-met",
    methodId: "m-icpms",
    methodVersion: 1,
    templateVersion: 1,
    status: "completed",
    currentStepIndex: 4, // final step of the pinned v1 (Report)
    compositionLatched: true,
    sampleIds: ["MET26-00004.001"],
    qc: [{ materialId: "qc-cs1", quantity: 1 }],
    workingCopy: {
      fileName: "working_copy_METB26-0001.csv",
      sizeBytes: 512,
      sha256: "seed-checksum-no-real-file-0000000000000000000000000000000000000000",
      generatedAt: "2026-06-21T09:00:00.000Z",
    },
    reagentLotIds: [],
    events: [
      { id: "bev-1-created", at: "2026-06-21T09:00:00.000Z", by: "labmanager@demolab.nl", type: "created", summary: "Batch created: 1 sample + 1 QC position (m-icpms v1)" },
    ],
    createdAt: "2026-06-21T09:00:00.000Z",
    createdBy: "labmanager@demolab.nl",
  });
  batches.set("org-demolab:METB26-0002", {
    id: "METB26-0002",
    orgId: "org-demolab",
    labId: "lab-met",
    methodId: "m-icpms",
    methodVersion: 1,
    templateVersion: 1,
    status: "open",
    currentStepIndex: 2, // work under way (Measurement) → composition latched
    compositionLatched: true,
    sampleIds: ["MET26-00003.001"],
    qc: [{ materialId: "qc-blk", quantity: 2 }],
    workingCopy: {
      fileName: "working_copy_METB26-0002.csv",
      sizeBytes: 498,
      sha256: "seed-checksum-no-real-file-0000000000000000000000000000000000000000",
      generatedAt: "2026-06-28T10:15:00.000Z",
    },
    reagentLotIds: [],
    events: [
      { id: "bev-2-created", at: "2026-06-28T10:15:00.000Z", by: "labmanager@demolab.nl", type: "created", summary: "Batch created: 1 sample + 2 QC positions (m-icpms v1)" },
    ],
    createdAt: "2026-06-28T10:15:00.000Z",
    createdBy: "labmanager@demolab.nl",
  });
  const batchFiles = new Map<string, Uint8Array>(); // seed working copies keep metadata only

  // Counters consistent with the seed (5 Metals jobs in 2026; sample seq per job).
  sequences.set("job:org-demolab:lab-met:2026", 5);
  sequences.set("batch:org-demolab:lab-met:2026", 2);
  sequences.set("sample:org-demolab:MET26-00001", 3);
  sequences.set("sample:org-demolab:MET26-00002", 1);
  sequences.set("sample:org-demolab:MET26-00003", 1);
  sequences.set("sample:org-demolab:MET26-00004", 1);
  sequences.set("sample:org-demolab:MET26-00005", 1);

  return {
    organisations,
    users,
    labs,
    orgSettings,
    methods,
    qcMaterials,
    equipment,
    equipmentTypes,
    jobs,
    batches,
    batchFiles,
    sequences,
  };
}

export const mockDb: MockDb = ((globalThis as Record<string, unknown>).__limsMockDbV17 ??=
  seedDb()) as MockDb;

export function getOrgSettings(orgId: string): OrgSettings {
  let settings = mockDb.orgSettings.get(orgId);
  if (!settings) {
    settings = defaultOrgSettings();
    mockDb.orgSettings.set(orgId, settings);
  }
  // Backfill sections added by later stories: a store seeded under an older
  // shape survives HMR on globalThis, so a missing section would otherwise
  // crash a long-running dev server until restart (dev-only concern).
  settings.equipment ??= defaultOrgSettings().equipment;
  return settings;
}

export function getOrgIdByName(name: string): string | null {
  for (const org of mockDb.organisations.values()) {
    if (org.name === name) return org.id;
  }
  return null;
}

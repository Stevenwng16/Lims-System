import { expect } from "vitest";
import { platformApi } from "@/lib/platform";
import { labApi } from "@/lib/labs";
import { methodApi } from "@/lib/methods";
import { jobApi } from "@/lib/jobs";
import { batchApi } from "@/lib/batches";
import { qcApi } from "@/lib/qc";
import { userApi } from "@/lib/users";
import { getOrgSettings, mockDb } from "@/lib/mock-db";

// Seed-agnostic fixtures: every test provisions its OWN organisation through
// the real APIs, so the suite passes identically against the demo seed and
// the clean seed, and parallel test files never share state.

let seq = 0;
export const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export type TestActor = {
  email: string;
  role: "admin" | "lab-manager" | "analyst" | "read-only";
  labs: string[];
  orgId: string;
  isSupport: boolean;
};

export function snapshot<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

export async function makeOrg() {
  const tag = uniq();
  const orgName = `TestOrg-${tag}`;
  const adminEmail = `admin-${tag}@test.dev`;
  const r = await platformApi.provisionOrganisation(orgName, adminEmail, "vendor@lims.dev");
  expect(r.status).toBe("success");
  const org = [...mockDb.organisations.values()].find((o) => o.name === orgName)!;
  const admin: TestActor = { email: adminEmail, role: "admin", labs: [], orgId: org.id, isSupport: false };
  return { orgId: org.id, orgName, admin, adminEmail, tag };
}

export async function makeLab(admin: TestActor, codeSuffix = uniq().slice(-4).toUpperCase()) {
  const code = `T${codeSuffix}`.slice(0, 8);
  const name = `Lab ${code}`;
  const r = await labApi.createLab(admin.orgId, { name, code, description: "" }, admin.email);
  expect(r.status).toBe("success");
  return [...mockDb.labs.values()].find((l) => l.orgId === admin.orgId && l.code === code)!;
}

export function addSampleType(orgId: string): string {
  const id = `st-${uniq()}`;
  getOrgSettings(orgId).sampleTypes.push({ id, name: `Type ${id}`, active: true });
  return id;
}

export async function makeMethod(admin: TestActor, labId: string) {
  const code = `M${uniq().slice(-5).toUpperCase()}`;
  const r = await methodApi.createMethod(admin, {
    name: `Method ${code}`,
    code,
    labId,
    description: "",
    accredited: false,
    maxSamplesPerBatch: 10,
    steps: [{ id: `s-${uniq()}`, name: "Prep", requiredEquipmentTypes: [] }],
    analytes: [{ id: `a-${uniq()}`, name: "Pb", unit: "mg/L", decimals: 2, loq: null }],
  });
  expect(r.status).toBe("success");
  return mockDb.methods.get((r as { methodId: string }).methodId)!;
}

export async function makeAcceptedJob(admin: TestActor, methodId: string, typeId: string) {
  const r = await jobApi.createJob(admin, {
    customer: `Customer ${uniq()}`,
    customerRef: "",
    receivedAt: "2026-07-17T10:00",
    requestedMethodIds: [],
    priority: "Standard",
    dueDate: "",
    notes: "",
    storageLocation: "",
    samples: [
      {
        typeId,
        description: "Test sample",
        customerSampleRef: "",
        quantity: "",
        quantityUnit: "",
        requestedMethodIds: [methodId],
        condition: "conforming",
        deviationType: "none",
        deviationNote: "",
        storageLocation: "",
      },
    ],
  });
  expect(r.status).toBe("success");
  const jobId = (r as { jobId: string }).jobId;
  const job = mockDb.jobs.get(`${admin.orgId}:${jobId}`)!;
  const sampleId = job.samples[0].id;
  const acc = await jobApi.setSampleAcceptance(admin, jobId, sampleId, "accepted", "");
  expect(acc.status).toBe("success");
  return { jobId, sampleId, job };
}

export async function makeBatch(
  admin: TestActor,
  labId: string,
  methodId: string,
  sampleIds: string[],
  qc: { materialId: string; quantity: number }[] = [],
) {
  const r = await batchApi.createBatch(admin, {
    labId,
    methodId,
    sampleIds,
    confirmAddMethod: [],
    qc,
  });
  expect(r.status).toBe("success");
  const batchId = (r as { batchId: string }).batchId;
  return mockDb.batches.get(`${admin.orgId}:${batchId}`)!;
}

export async function makeBlankQcMaterial(admin: TestActor, labId: string) {
  const code = `Q${uniq().slice(-5).toUpperCase()}`;
  const r = await qcApi.createMaterial(admin, {
    name: `Blank ${code}`,
    code,
    type: "blank",
    labId,
    supplier: "",
    lotNumber: "",
    expiryDate: "",
    description: "",
    expectedValues: [],
  });
  expect(r.status).toBe("success");
  return mockDb.qcMaterials.get((r as { materialId: string }).materialId)!;
}

/** Creates a real user account (exists in the store, required for batch-work
 * clearance checks) and returns an actor for it. */
export async function makeUser(
  admin: TestActor,
  role: TestActor["role"],
  labNames: string[],
  clearances: string[] = [],
) {
  const email = `${role}-${uniq()}@test.dev`;
  const r = await userApi.createUser(
    { email: admin.email, role: "admin", labs: admin.labs, orgId: admin.orgId },
    { name: `Test ${role}`, email, role, labs: labNames, clearances },
  );
  expect(r.status).toBe("success");
  const actor: TestActor = { email, role, labs: labNames, orgId: admin.orgId, isSupport: false };
  return actor;
}

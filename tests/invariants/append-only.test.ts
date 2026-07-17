import { describe, expect, test } from "vitest";
import { platformApi } from "@/lib/platform";
import { labApi } from "@/lib/labs";
import { methodApi } from "@/lib/methods";
import { jobApi } from "@/lib/jobs";
import { qcApi } from "@/lib/qc";
import { equipmentApi } from "@/lib/equipment";
import { settingsApi } from "@/lib/settings";
import { userApi } from "@/lib/users";
import { getOrgSettings, mockDb } from "@/lib/mock-db";
import { addSampleType, makeAcceptedJob, makeBlankQcMaterial, makeLab, makeMethod, makeOrg, snapshot } from "../helpers";

// Invariants 1 + 6: every audited mutation appends EXACTLY ONE event carrying
// actor + timestamp; prior events are never modified or removed.

type Ev = { id: string; at: string; by: string; summary: string };

function expectOneAppended(before: Ev[], after: Ev[], actorEmail: string) {
  expect(after.length).toBe(before.length + 1);
  // Prior events byte-for-byte unchanged (deep compare).
  expect(snapshot(after.slice(0, before.length))).toEqual(before);
  const ev = after[after.length - 1];
  expect(ev.by).toBe(actorEmail);
  expect(Number.isNaN(new Date(ev.at).getTime())).toBe(false);
  expect(ev.summary.length).toBeGreaterThan(0);
  expect(ev.id.length).toBeGreaterThan(0);
}

describe("append-only audit events", () => {
  test("organisation status changes append to the platform audit log", async () => {
    const { orgId } = await makeOrg();
    const before = snapshot(mockDb.platformAudit);
    const r = await platformApi.suspendOrganisation(orgId, "test suspension", "vendor@lims.dev");
    expect(r.status).toBe("success");
    expectOneAppended(before, mockDb.platformAudit, "vendor@lims.dev");
    expect(mockDb.platformAudit[mockDb.platformAudit.length - 1].summary).toContain("test suspension");
  });

  test("lab edits and status changes append attributed events", async () => {
    const { admin, orgId } = await makeOrg();
    const lab = await makeLab(admin);
    let before = snapshot(lab.events);
    await labApi.updateLab(orgId, lab.id, { name: `${lab.name} renamed`, code: lab.code, description: "d" }, admin.email);
    expectOneAppended(before, lab.events, admin.email);
    expect(lab.events[lab.events.length - 1].summary).toContain("→");

    before = snapshot(lab.events);
    const second = await makeLab(admin); // keep AC 7 satisfied before deactivating
    expect(second.id).not.toBe(lab.id);
    const r = await labApi.setLabStatus(orgId, lab.id, "inactive", "audit reason", admin.email);
    expect(r.status).toBe("success");
    expectOneAppended(before, lab.events, admin.email);
    expect(lab.events[lab.events.length - 1].summary).toContain("audit reason");
  });

  test("method status change appends an attributed event", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const method = await makeMethod(admin, lab.id);
    const before = snapshot(method.events);
    const r = await methodApi.setMethodStatus(admin, method.id, "inactive", "retired for test");
    expect(r.status).toBe("success");
    expectOneAppended(before, method.events, admin.email);
  });

  test("QC material edit and status change append attributed events", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const material = await makeBlankQcMaterial(admin, lab.id);
    const before = snapshot(material.events);
    const r = await qcApi.setStatus(admin, material.id, "inactive", "lot closed for test");
    expect(r.status).toBe("success");
    expectOneAppended(before, material.events, admin.email);
  });

  test("equipment type create/rename/status all append attributed events", async () => {
    const { admin } = await makeOrg();
    const name = `Type-${Date.now()}`;
    await equipmentApi.createType(admin, name);
    const type = [...mockDb.equipmentTypes.values()].find((t) => t.orgId === admin.orgId && t.name === name)!;
    expect(type.events.length).toBe(1); // creation is attributed
    expect(type.events[0].by).toBe(admin.email);

    const before = snapshot(type.events);
    await equipmentApi.renameType(admin, type.id, `${name} v2`);
    expectOneAppended(before, type.events, admin.email);
  });

  test("job edits append attributed events with before→after", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const method = await makeMethod(admin, lab.id);
    const typeId = addSampleType(admin.orgId);
    const { jobId, job } = await makeAcceptedJob(admin, method.id, typeId);
    const before = snapshot(job.events);
    const r = await jobApi.voidJob(admin, jobId, "registered in error (test)");
    expect(r.status).toBe("success");
    expectOneAppended(before, job.events, admin.email);
  });

  test("settings saves append to settingsEvents", async () => {
    const { admin, orgId } = await makeOrg();
    const settings = getOrgSettings(orgId);
    const before = snapshot(settings.settingsEvents);
    const r = await settingsApi.updateSecurity(
      orgId,
      { ...settings.security, lockoutThreshold: 7 },
      admin.email,
    );
    expect(r.status).toBe("success");
    expectOneAppended(before, settings.settingsEvents, admin.email);
  });

  test("user edits append attributed events to the user's trail", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const email = `edit-target-${Date.now()}@test.dev`;
    await userApi.createUser(
      { email: admin.email, role: "admin", labs: [], orgId: admin.orgId },
      { name: "Target", email, role: "analyst", labs: [lab.name], clearances: [] },
    );
    const target = mockDb.users.get(email)!;
    const before = snapshot(target.events);
    const r = await userApi.updateUser(
      { email: admin.email, role: "admin", labs: [], orgId: admin.orgId },
      email,
      { name: "Target Renamed", email, role: "analyst", labs: [lab.name], clearances: [], status: "active" },
    );
    expect(r.status).toBe("success");
    const after = mockDb.users.get(email)!.events;
    expect(after.length).toBeGreaterThan(before.length);
    expect(snapshot(after.slice(0, before.length))).toEqual(before);
    expect(after[after.length - 1].by).toBe(admin.email);
  });
});

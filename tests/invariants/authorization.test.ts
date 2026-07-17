import { describe, expect, test } from "vitest";
import { jobApi } from "@/lib/jobs";
import { methodApi } from "@/lib/methods";
import { equipmentApi } from "@/lib/equipment";
import { batchApi } from "@/lib/batches";
import { currentMethodVersion } from "@/lib/mock-db";
import { addSampleType, makeAcceptedJob, makeBatch, makeLab, makeMethod, makeOrg, makeUser } from "../helpers";

// Invariant 4: the role matrix and method clearances hold at Api level,
// independent of any UI hiding.

describe("server-side authorization", () => {
  test("an analyst cannot perform admin/manager-only actions", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const method = await makeMethod(admin, lab.id);
    const analyst = await makeUser(admin, "analyst", [lab.name], [method.id]);

    const createJob = await jobApi.createJob(analyst, {
      customer: "X",
      customerRef: "",
      receivedAt: "2026-07-17T10:00",
      requestedMethodIds: [],
      priority: "Standard",
      dueDate: "",
      notes: "",
      storageLocation: "",
      samples: [],
    });
    expect(createJob.status).toBe("error");

    const manageMethod = await methodApi.setMethodStatus(analyst, method.id, "inactive", "r");
    expect(manageMethod.status).toBe("error");

    const manageTypes = await equipmentApi.createType(analyst, "Sneaky type");
    expect(manageTypes.status).toBe("error");
  });

  test("lab managers cannot manage the admin-only equipment-type list", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const manager = await makeUser(admin, "lab-manager", [lab.name]);
    const r = await equipmentApi.createType(manager, "Manager type");
    expect(r.status).toBe("error");
  });

  test("method clearance gates batch work for analysts", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const method = await makeMethod(admin, lab.id);
    const typeId = addSampleType(admin.orgId);
    const { sampleId } = await makeAcceptedJob(admin, method.id, typeId);
    const batch = await makeBatch(admin, lab.id, method.id, [sampleId]);
    const analyteId = currentMethodVersion(method).analytes[0].id;
    const target = { targetType: "sample" as const, targetId: sampleId };

    const uncleared = await makeUser(admin, "analyst", [lab.name], []);
    const refused = await batchApi.enterResult(uncleared, batch.id, target, analyteId, { kind: "numeric", raw: "2.0" }, "", null);
    expect(refused.status).toBe("error");
    expect((refused as { message: string }).message.toLowerCase()).toContain("cleared");

    const cleared = await makeUser(admin, "analyst", [lab.name], [method.id]);
    const allowed = await batchApi.enterResult(cleared, batch.id, target, analyteId, { kind: "numeric", raw: "2.0" }, "", null);
    expect(allowed.status).toBe("success");
  });

  test("read-only users cannot work on batches", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const method = await makeMethod(admin, lab.id);
    const typeId = addSampleType(admin.orgId);
    const { sampleId } = await makeAcceptedJob(admin, method.id, typeId);
    const batch = await makeBatch(admin, lab.id, method.id, [sampleId]);
    const readonly = await makeUser(admin, "read-only", [lab.name]);
    const analyteId = currentMethodVersion(method).analytes[0].id;
    const r = await batchApi.enterResult(readonly, batch.id, { targetType: "sample", targetId: sampleId }, analyteId, { kind: "numeric", raw: "2.0" }, "", null);
    expect(r.status).toBe("error");
  });
});

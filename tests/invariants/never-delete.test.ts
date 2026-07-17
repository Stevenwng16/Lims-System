import { describe, expect, test } from "vitest";
import { platformApi } from "@/lib/platform";
import { labApi } from "@/lib/labs";
import { methodApi } from "@/lib/methods";
import { jobApi } from "@/lib/jobs";
import { qcApi } from "@/lib/qc";
import { equipmentApi } from "@/lib/equipment";
import { mockDb } from "@/lib/mock-db";
import { addSampleType, makeAcceptedJob, makeBlankQcMaterial, makeLab, makeMethod, makeOrg } from "../helpers";

// Invariant 2: void/deactivate keep the record present (with a reason);
// domain maps never lose keys.

describe("never delete", () => {
  test("voided jobs and samples stay present and reconstructable", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const method = await makeMethod(admin, lab.id);
    const typeId = addSampleType(admin.orgId);
    const { jobId, sampleId } = await makeAcceptedJob(admin, method.id, typeId);

    // A job keeps at least one live sample — voiding the only one refuses…
    const lastSample = await jobApi.voidSample(admin, jobId, sampleId, "attempt");
    expect(lastSample.status).toBe("error");

    // …so add a second sample, then void the first.
    const added = await jobApi.addSample(admin, jobId, {
      typeId,
      description: "Second sample",
      customerSampleRef: "",
      quantity: "",
      quantityUnit: "",
      requestedMethodIds: [method.id],
      condition: "conforming",
      deviationType: "none",
      deviationNote: "",
      storageLocation: "",
    });
    expect(added.status).toBe("success");

    const keysBefore = mockDb.jobs.size;
    const rs = await jobApi.voidSample(admin, jobId, sampleId, "sample voided in test");
    expect(rs.status).toBe("success");
    const rj = await jobApi.voidJob(admin, jobId, "job voided in test");
    expect(rj.status).toBe("success");

    expect(mockDb.jobs.size).toBe(keysBefore); // no key lost
    const job = mockDb.jobs.get(`${admin.orgId}:${jobId}`)!;
    expect(job.voided).toBe(true);
    expect(job.voidReason).toBe("job voided in test");
    const sample = job.samples.find((s) => s.id === sampleId)!;
    expect(sample.voided).toBe(true);
  });

  test("deactivation keeps labs, methods, QC materials and equipment types", async () => {
    const { admin, orgId } = await makeOrg();
    const lab = await makeLab(admin);
    await makeLab(admin); // second lab so the first may deactivate (AC 7)
    const method = await makeMethod(admin, lab.id);
    const material = await makeBlankQcMaterial(admin, lab.id);
    await equipmentApi.createType(admin, `ND-Type-${Date.now()}`);
    const type = [...mockDb.equipmentTypes.values()].find((t) => t.orgId === orgId)!;

    const counts = {
      labs: mockDb.labs.size,
      methods: mockDb.methods.size,
      qc: mockDb.qcMaterials.size,
      types: mockDb.equipmentTypes.size,
    };

    expect((await methodApi.setMethodStatus(admin, method.id, "inactive", "r")).status).toBe("success");
    expect((await qcApi.setStatus(admin, material.id, "inactive", "r")).status).toBe("success");
    expect((await equipmentApi.setTypeStatus(admin, type.id, "inactive", "r")).status).toBe("success");
    expect((await labApi.setLabStatus(orgId, lab.id, "inactive", "r", admin.email)).status).toBe("success");

    expect(mockDb.labs.size).toBe(counts.labs);
    expect(mockDb.methods.size).toBe(counts.methods);
    expect(mockDb.qcMaterials.size).toBe(counts.qc);
    expect(mockDb.equipmentTypes.size).toBe(counts.types);
    expect(mockDb.labs.get(lab.id)!.status).toBe("inactive");
    expect(mockDb.labs.get(lab.id)!.statusReason).toBe("r");
  });

  test("suspending and deactivating an organisation never removes it", async () => {
    const { orgId } = await makeOrg();
    const orgCount = mockDb.organisations.size;
    expect((await platformApi.suspendOrganisation(orgId, "r", "vendor@lims.dev")).status).toBe("success");
    expect((await platformApi.reactivateOrganisation(orgId, "r", "vendor@lims.dev")).status).toBe("success");
    expect((await platformApi.deactivateOrganisation(orgId, "r", "vendor@lims.dev")).status).toBe("success");
    expect(mockDb.organisations.size).toBe(orgCount);
    expect(mockDb.organisations.get(orgId)!.status).toBe("deactivated");
  });
});

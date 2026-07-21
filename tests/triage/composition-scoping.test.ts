import { describe, expect, test } from "vitest";
import { batchApi } from "@/lib/batches";
import { qcApi } from "@/lib/qc";
import { mockDb } from "@/lib/mock-db";
import {
  addSampleType,
  makeAcceptedJob,
  makeBatch,
  makeBlankQcMaterial,
  makeLab,
  makeMethod,
  makeOrg,
  uniq,
} from "../helpers";

// Triage decisions 11 + 15 (17 Jul 2026).

describe("decision 11: import configs list under the masterdata exemption", () => {
  test("labId null lists across the actor's labs; concrete labId still scopes", async () => {
    const { admin } = await makeOrg();
    const labA = await makeLab(admin);
    const labB = await makeLab(admin);
    for (const lab of [labA, labB]) {
      const r = await batchApi.saveImportConfig(admin, null, {
        name: `Cfg ${lab.code}`,
        labId: lab.id,
        fileType: "csv",
        sheetName: "",
        orientation: "wide",
        idColumn: "Sample",
        columns: [{ header: "Pb", analyteName: "Pb", unit: "mg/L" }],
        analyteColumn: "",
        valueColumn: "",
        longUnits: [],
        decimalSeparator: "point",
        csvDelimiter: "comma",
      });
      expect(r.status).toBe("success");
    }
    const all = await batchApi.listImportConfigs(admin, null);
    expect(all.length).toBe(2);
    const scoped = await batchApi.listImportConfigs(admin, labA.id);
    expect(scoped.length).toBe(1);
    expect(scoped[0].labId).toBe(labA.id);
  });
});

describe("decision 15: a QC-code collision is blocked at composition", () => {
  test("adding a second material with a held entry's code refuses", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const method = await makeMethod(admin, lab.id);
    const typeId = addSampleType(admin.orgId);
    const { sampleId } = await makeAcceptedJob(admin, method.id, typeId);

    // Two materials with the SAME code: only possible via grandfathering —
    // deactivate the first, then create the second under the freed code.
    const first = await makeBlankQcMaterial(admin, lab.id);
    const code = first.code;
    const batch = await makeBatch(admin, lab.id, method.id, [sampleId], [
      { materialId: first.id, quantity: 1 },
    ]);
    expect((await qcApi.setStatus(admin, first.id, "inactive", "old lot (test)")).status).toBe("success");
    const secondCreate = await qcApi.createMaterial(admin, {
      name: `Blank reissue ${uniq()}`,
      code,
      type: "blank",
      labId: lab.id,
      supplier: "",
      lotNumber: "",
      expiryDate: "",
      description: "",
      expectedValues: [],
    });
    expect(secondCreate.status).toBe("success");
    const secondId = (secondCreate as { materialId: string }).materialId;

    // The edit that would CREATE the collision refuses…
    const collide = await batchApi.updateComposition(admin, batch.id, {
      sampleIds: [sampleId],
      confirmAddMethod: [],
      qc: [
        { materialId: first.id, quantity: 1 },
        { materialId: secondId, quantity: 1 },
      ],
    });
    expect(collide.status).toBe("error");
    expect((collide as { message: string }).message).toContain(code);
    expect(mockDb.batches.get(`${admin.orgId}:${batch.id}`)!.qc.length).toBe(1);

    // …while swapping the held entry for the new lot stays legal.
    const swap = await batchApi.updateComposition(admin, batch.id, {
      sampleIds: [sampleId],
      confirmAddMethod: [],
      qc: [{ materialId: secondId, quantity: 1 }],
    });
    expect(swap.status).toBe("success");
  });
});

import { describe, expect, test } from "vitest";
import { methodApi } from "@/lib/methods";
import { batchApi } from "@/lib/batches";
import { currentMethodVersion } from "@/lib/mock-db";
import { addSampleType, makeAcceptedJob, makeBatch, makeLab, makeMethod, makeOrg, snapshot } from "../helpers";

// Invariant 3 + ADR-2: used masterdata versions instead of overwriting;
// result corrections are new records with supersedes + mandatory reason,
// and the superseded record stays byte-for-byte unchanged.

describe("version, don't overwrite", () => {
  test("editing a batch-used method appends a MethodVersion; the old version is frozen", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const method = await makeMethod(admin, lab.id);
    const typeId = addSampleType(admin.orgId);
    const { sampleId } = await makeAcceptedJob(admin, method.id, typeId);
    await makeBatch(admin, lab.id, method.id, [sampleId]);

    expect(method.usedByBatches).toBe(true);
    const v1 = currentMethodVersion(method);
    const v1Snapshot = snapshot(v1);
    const versionsBefore = method.versions.length;

    const r = await methodApi.updateMethod(admin, method.id, {
      name: v1.name,
      code: v1.code,
      labId: v1.labId,
      description: "changed while in use",
      accredited: v1.accredited,
      maxSamplesPerBatch: v1.maxSamplesPerBatch,
      steps: v1.steps.map((s) => ({ id: s.id, name: s.name, requiredEquipmentTypes: [...s.requiredEquipmentTypes] })),
      analytes: v1.analytes.map((a) => ({ ...a })),
    });
    expect(r.status).toBe("success");

    expect(method.versions.length).toBe(versionsBefore + 1);
    // The version the batch pinned is byte-for-byte unchanged.
    expect(snapshot(method.versions[versionsBefore - 1])).toEqual(v1Snapshot);
    expect(currentMethodVersion(method).description).toBe("changed while in use");
    expect(currentMethodVersion(method).version).toBe(v1Snapshot.version + 1);
  });

  test("a result correction is a new record with supersedes + mandatory reason; the original is frozen", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const method = await makeMethod(admin, lab.id);
    const typeId = addSampleType(admin.orgId);
    const { sampleId } = await makeAcceptedJob(admin, method.id, typeId);
    const batch = await makeBatch(admin, lab.id, method.id, [sampleId]);
    const analyteId = currentMethodVersion(method).analytes[0].id;
    const target = { targetType: "sample" as const, targetId: sampleId };

    const first = await batchApi.enterResult(admin, batch.id, target, analyteId, { kind: "numeric", raw: "1.50" }, "", null);
    expect(first.status).toBe("success");
    expect(batch.results.length).toBe(1);
    const original = batch.results[0];
    const originalSnapshot = snapshot(original);
    expect(original.enteredBy).toBe(admin.email);
    expect(original.validity).toBe("pending");

    // Correction WITHOUT a reason must refuse.
    const noReason = await batchApi.enterResult(admin, batch.id, target, analyteId, { kind: "numeric", raw: "1.55" }, "", original.id);
    expect(noReason.status).toBe("error");
    expect(batch.results.length).toBe(1);

    // Correction with a reason: NEW record, supersedes pointer, original untouched.
    const corrected = await batchApi.enterResult(admin, batch.id, target, analyteId, { kind: "numeric", raw: "1.55" }, "typo in entry", original.id);
    expect(corrected.status).toBe("success");
    expect(batch.results.length).toBe(2);
    const replacement = batch.results[1];
    expect(replacement.supersedes).toBe(original.id);
    expect(replacement.supersedeReason).toBe("typo in entry");
    expect(snapshot(batch.results[0])).toEqual(originalSnapshot); // byte-for-byte
  });
});

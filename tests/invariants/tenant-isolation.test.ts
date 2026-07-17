import { describe, expect, test } from "vitest";
import { jobApi } from "@/lib/jobs";
import { methodApi } from "@/lib/methods";
import { equipmentApi } from "@/lib/equipment";
import { qcApi } from "@/lib/qc";
import { mockDb } from "@/lib/mock-db";
import { addSampleType, makeAcceptedJob, makeLab, makeMethod, makeOrg } from "../helpers";

// Invariant 5: no read or mutation crosses the organisation boundary through
// any Api; org-composite keys keep org-unique numbers collision-free.

describe("tenant isolation", () => {
  test("an actor from org A can neither read nor mutate org B's records", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const labB = await makeLab(b.admin);
    const methodB = await makeMethod(b.admin, labB.id);
    const typeB = addSampleType(b.orgId);
    const { jobId: jobB } = await makeAcceptedJob(b.admin, methodB.id, typeB);

    // Reads
    expect(await jobApi.getJob(a.admin, jobB)).toBeNull();
    const methodsSeenByA = await methodApi.listMethods(a.admin);
    expect(methodsSeenByA.some((m) => m.id === methodB.id)).toBe(false);
    expect(await qcApi.getMaterial(a.admin, `${b.orgId}-nonexistent`)).toBeNull();

    // Mutations
    const voidAttempt = await jobApi.voidJob(a.admin, jobB, "cross-tenant attempt");
    expect(voidAttempt.status).toBe("error");
    const statusAttempt = await methodApi.setMethodStatus(a.admin, methodB.id, "inactive", "cross-tenant");
    expect(statusAttempt.status).toBe("error");
    expect(mockDb.methods.get(methodB.id)!.status).toBe("active");

    await equipmentApi.createType(b.admin, `Iso-${Date.now()}`);
    const typeOfB = [...mockDb.equipmentTypes.values()].find((t) => t.orgId === b.orgId)!;
    const typeAttempt = await equipmentApi.setTypeStatus(a.admin, typeOfB.id, "inactive", "cross-tenant");
    expect(typeAttempt.status).toBe("error");
  });

  test("identical job numbers in two orgs coexist under org-composite keys", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const labA = await makeLab(a.admin);
    const labB = await makeLab(b.admin);
    const mA = await makeMethod(a.admin, labA.id);
    const mB = await makeMethod(b.admin, labB.id);
    const { jobId: jobA } = await makeAcceptedJob(a.admin, mA.id, addSampleType(a.orgId));
    const { jobId: jobB } = await makeAcceptedJob(b.admin, mB.id, addSampleType(b.orgId));

    // Fresh orgs run independent sequences → the same rendered number.
    expect(jobA).toBe(jobB);
    // …and neither overwrote the other: each org retrieves its OWN job.
    const seenByA = await jobApi.getJob(a.admin, jobA);
    const seenByB = await jobApi.getJob(b.admin, jobB);
    expect(seenByA!.orgId).toBe(a.orgId);
    expect(seenByB!.orgId).toBe(b.orgId);
    expect(seenByA!.customer).not.toBe(seenByB!.customer);
  });
});

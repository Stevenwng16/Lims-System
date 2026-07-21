import { describe, expect, test } from "vitest";
import { jobApi } from "@/lib/jobs";
import { batchApi } from "@/lib/batches";
import { addSampleType, makeAcceptedJob, makeBatch, makeLab, makeMethod, makeOrg } from "../helpers";

// Triage decision 3 (17 Jul 2026): voiding a sample or job is refused while
// the sample sits in an open/awaiting-review batch.

describe("decision 3: no voids while a sample is in an unfinished batch", () => {
  test("voidSample and voidJob refuse; voiding the batch unlocks them", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const method = await makeMethod(admin, lab.id);
    const typeId = addSampleType(admin.orgId);
    const { jobId, sampleId } = await makeAcceptedJob(admin, method.id, typeId);
    const batch = await makeBatch(admin, lab.id, method.id, [sampleId]);

    const vs = await jobApi.voidSample(admin, jobId, sampleId, "attempt");
    expect(vs.status).toBe("error");
    expect((vs as { message: string }).message).toContain(batch.id);

    const vj = await jobApi.voidJob(admin, jobId, "attempt");
    expect(vj.status).toBe("error");
    expect((vj as { message: string }).message).toContain(batch.id);

    // Sanctioned exit: void the batch, then the job may be voided.
    expect((await batchApi.voidBatch(admin, batch.id, "test exit")).status).toBe("success");
    expect((await jobApi.voidJob(admin, jobId, "registered in error")).status).toBe("success");
  });
});

import { describe, expect, test } from "vitest";
import { batchApi } from "@/lib/batches";
import { currentMethodVersion } from "@/lib/mock-db";
import {
  addSampleType,
  makeAcceptedJob,
  makeBatch,
  makeBlankQcMaterial,
  makeLab,
  makeMethod,
  makeOrg,
} from "../helpers";

// Triage decisions 5 + 6 (17 Jul 2026): a current-rejected cell blocks batch
// completion until superseded (AC 6 read literally), and QC cells share the
// completeness universe with sample cells.

describe("decisions 5+6: completion gate", () => {
  test("rejected cells and unmeasured QC cells block completion; closure unlocks it", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const method = await makeMethod(admin, lab.id);
    const typeId = addSampleType(admin.orgId);
    const { sampleId } = await makeAcceptedJob(admin, method.id, typeId);
    const blank = await makeBlankQcMaterial(admin, lab.id);
    const batch = await makeBatch(admin, lab.id, method.id, [sampleId], [
      { materialId: blank.id, quantity: 1 },
    ]);
    const analyteId = currentMethodVersion(method).analytes[0].id;

    // Enter the sample result during the open step, then advance to review.
    expect(
      (
        await batchApi.enterResult(
          admin,
          batch.id,
          { targetType: "sample", targetId: sampleId },
          analyteId,
          { kind: "numeric", raw: "1.23" },
          "",
          null,
        )
      ).status,
    ).toBe("success");
    // The final step is gated on an attached completed worksheet (US-D4).
    expect(
      (
        await batchApi.uploadWorksheet(admin, batch.id, {
          fileName: "worksheet.xlsx",
          bytes: new Uint8Array([1, 2, 3]),
        })
      ).status,
    ).toBe("success");
    expect((await batchApi.completeStep(admin, batch.id, 0, [])).status).toBe("success");
    expect(batch.status).toBe("awaiting-review");

    // The QC cell is unmeasured → it is a gap and completion is blocked.
    let view = (await batchApi.reviewView(admin, batch.id))!;
    expect(view.gaps.some((g) => g.targetType === "qc" && g.kind === "empty")).toBe(true);

    // Reject the sample value → a bare rejected cell also blocks.
    const record = batch.results.find((r) => r.targetType === "sample")!;
    expect(
      (await batchApi.setResultValidity(admin, batch.id, record.id, "rejected", "implausible")).status,
    ).toBe("success");
    const blocked = await batchApi.completeBatch(admin, batch.id);
    expect(blocked.status).toBe("error");
    expect((blocked as { message: string }).message).toContain("rejected");

    view = (await batchApi.reviewView(admin, batch.id))!;
    expect(view.gaps.some((g) => g.kind === "rejected")).toBe(true);

    // Close the rejected sample cell: the no-result SUPERSEDES the rejection.
    expect(
      (
        await batchApi.closeGapNoResult(
          admin,
          batch.id,
          { targetType: "sample", targetId: sampleId },
          analyteId,
          "no re-measurement possible",
        )
      ).status,
    ).toBe("success");
    const closure = batch.results[batch.results.length - 1];
    expect(closure.supersedes).toBe(record.id);
    expect(closure.value.kind).toBe("no-result");

    // Close the unmeasured QC cell (decision 6: QC targets accepted).
    expect(
      (
        await batchApi.closeGapNoResult(
          admin,
          batch.id,
          { targetType: "qc", targetId: blank.id },
          analyteId,
          "blank not run in this series",
        )
      ).status,
    ).toBe("success");

    expect((await batchApi.completeBatch(admin, batch.id)).status).toBe("success");
    expect(batch.status).toBe("completed");
  });
});

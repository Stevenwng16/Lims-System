import { describe, expect, test } from "vitest";
import { equipmentApi } from "@/lib/equipment";
import { mockDb } from "@/lib/mock-db";
import { makeLab, makeOrg, uniq, type TestActor } from "../helpers";

// Triage decisions 1 + 2 (17 Jul 2026): no-calibration blocks availability;
// a check type that currently blocks cannot be retired or re-scheduled away.

async function makeEquipment(admin: TestActor, labId: string) {
  const typeName = `Type-${uniq()}`;
  await equipmentApi.createType(admin, typeName);
  const type = [...mockDb.equipmentTypes.values()].find(
    (t) => t.orgId === admin.orgId && t.name === typeName,
  )!;
  const assetId = `AST-${uniq().slice(-8)}`;
  const r = await equipmentApi.createEquipment(admin, {
    name: `Eq ${assetId}`,
    assetId,
    typeId: type.id,
    labId,
    manufacturer: "",
    model: "",
    serialNumber: "",
    location: "",
    description: "",
  });
  expect(r.status).toBe("success");
  return [...mockDb.equipment.values()].find(
    (e) => e.orgId === admin.orgId && e.assetId === assetId,
  )!;
}

async function availabilityOf(admin: TestActor, assetId: string) {
  const list = await equipmentApi.listEquipment(admin);
  return list.find((i) => i.assetId === assetId)!.availability;
}

const future = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);

describe("decision 1: never-calibrated equipment is Blocked", () => {
  test("fresh equipment blocks until a calibration is recorded", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const eq = await makeEquipment(admin, lab.id);

    const before = await availabilityOf(admin, eq.assetId);
    expect(before.state).toBe("blocked");
    expect(before.blockedReasons.join(" ")).toContain("No calibration recorded");

    const r = await equipmentApi.updateCalibration(admin, eq.id, {
      intervalMonths: null,
      lastDate: null,
      dueDate: future,
    });
    expect(r.status).toBe("success");
    const after = await availabilityOf(admin, eq.assetId);
    expect(after.state).toBe("available");
  });
});

describe("decision 2: a blocking check type cannot be retired or re-scheduled away", () => {
  async function calibratedEquipmentWithDailyCheck(admin: TestActor, labId: string) {
    const eq = await makeEquipment(admin, labId);
    expect((await equipmentApi.updateCalibration(admin, eq.id, { intervalMonths: null, lastDate: null, dueDate: future })).status).toBe("success");
    expect(
      (
        await equipmentApi.addCheckType(admin, eq.id, {
          name: "Daily wipe",
          frequency: "daily",
          criterion: { kind: "manual", description: "clean and confirm" },
        })
      ).status,
    ).toBe("success");
    const ct = mockDb.equipment.get(eq.id)!.checkTypes[0];
    return { eq, ct };
  }

  test("never-performed scheduled check: retire and per-use re-schedule refused; a pass unlocks retirement", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const { eq, ct } = await calibratedEquipmentWithDailyCheck(admin, lab.id);

    expect((await availabilityOf(admin, eq.assetId)).state).toBe("blocked");

    const retire = await equipmentApi.setCheckTypeStatus(admin, eq.id, ct.id, "inactive", "no longer needed");
    expect(retire.status).toBe("error");
    expect((retire as { message: string }).message).toContain("cannot be retired");

    const reschedule = await equipmentApi.updateCheckType(admin, eq.id, ct.id, {
      name: ct.name,
      frequency: "per-use",
      criterion: { kind: "manual", description: "clean and confirm" },
    });
    expect(reschedule.status).toBe("error");
    expect((reschedule as { message: string }).message).toContain("would clear an active block");

    // A passing entry resolves the condition — the sanctioned route.
    expect(
      (
        await equipmentApi.logCheck(admin, eq.id, {
          checkTypeId: ct.id,
          measuredValue: "",
          result: "pass",
          notes: "",
        })
      ).status,
    ).toBe("success");
    expect((await availabilityOf(admin, eq.assetId)).state).toBe("available");
    expect(
      (await equipmentApi.setCheckTypeStatus(admin, eq.id, ct.id, "inactive", "no longer needed")).status,
    ).toBe("success");
  });

  test("a FAILED last check blocks retirement even for per-use scheduling", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const { eq, ct } = await calibratedEquipmentWithDailyCheck(admin, lab.id);

    expect(
      (
        await equipmentApi.logCheck(admin, eq.id, {
          checkTypeId: ct.id,
          measuredValue: "",
          result: "fail",
          notes: "smudged",
        })
      ).status,
    ).toBe("success");

    const retire = await equipmentApi.setCheckTypeStatus(admin, eq.id, ct.id, "inactive", "inconvenient");
    expect(retire.status).toBe("error");
    expect((retire as { message: string }).message).toContain("failed");
  });
});

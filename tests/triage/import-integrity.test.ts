import ExcelJS from "exceljs";
import { describe, expect, test } from "vitest";
import { batchApi } from "@/lib/batches";
import { settingsApi } from "@/lib/settings";
import {
  addSampleType,
  makeAcceptedJob,
  makeBatch,
  makeLab,
  makeMethod,
  makeOrg,
  uniq,
  type TestActor,
} from "../helpers";

// Triage decisions 7 (interim), 8, 9 and 12 (17 Jul 2026): Excel imports read
// only string cells from a DECLARED sheet; qualifier names may not look
// numeric; an all-rejected import still stores its event.

async function importFixture(admin: TestActor) {
  const lab = await makeLab(admin);
  const method = await makeMethod(admin, lab.id);
  const typeId = addSampleType(admin.orgId);
  const { sampleId } = await makeAcceptedJob(admin, method.id, typeId);
  const batch = await makeBatch(admin, lab.id, method.id, [sampleId]);
  const cfg = await batchApi.saveImportConfig(admin, null, {
    name: `Cfg ${uniq()}`,
    labId: lab.id,
    fileType: "excel",
    sheetName: "Results",
    orientation: "wide",
    idColumn: "Sample",
    columns: [{ header: "Pb", analyteName: "Pb", unit: "mg/L" }],
    analyteColumn: "",
    valueColumn: "",
    longUnits: [],
    decimalSeparator: "point",
    csvDelimiter: "comma",
  });
  expect(cfg.status).toBe("success");
  const configs = await batchApi.listImportConfigs(admin, lab.id);
  const configId = configs[configs.length - 1].id;
  return { batch, sampleId, configId };
}

async function workbookBytes(sheetName: string, cells: (string | number)[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  for (const row of cells) ws.addRow(row);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("decisions 7+9: xlsx import reads string cells from the declared sheet", () => {
  test("a workbook without the declared sheet refuses", async () => {
    const { admin } = await makeOrg();
    const { batch, configId } = await importFixture(admin);
    const bytes = await workbookBytes("Summary", [["Sample", "Pb"], ["X", "1.0"]]);
    const r = await batchApi.previewImport(admin, batch.id, configId, { fileName: "e.xlsx", bytes });
    expect(r.status).toBe("error");
    expect((r as { message: string }).message).toContain('"Results"');
  });

  test("number-typed cells refuse with the cell named; string cells import", async () => {
    const { admin } = await makeOrg();
    const { batch, sampleId, configId } = await importFixture(admin);

    // ExcelJS stores 0.01 as a NUMBER cell → the file must refuse.
    const numeric = await workbookBytes("Results", [["Sample", "Pb"], [sampleId, 0.01]]);
    const rejected = await batchApi.previewImport(admin, batch.id, configId, { fileName: "e.xlsx", bytes: numeric });
    expect(rejected.status).toBe("error");
    expect((rejected as { message: string }).message).toContain("stored by Excel as numbers");

    // All-string cells preview fine, full precision preserved.
    const text = await workbookBytes("Results", [["Sample", "Pb"], [sampleId, "0.010"]]);
    const ok = await batchApi.previewImport(admin, batch.id, configId, { fileName: "e.xlsx", bytes: text });
    expect(ok.status).toBe("success");
  });

  test("saving an Excel config without a sheet name refuses", async () => {
    const { admin } = await makeOrg();
    const lab = await makeLab(admin);
    const r = await batchApi.saveImportConfig(admin, null, {
      name: "No sheet",
      labId: lab.id,
      fileType: "excel",
      sheetName: "  ",
      orientation: "wide",
      idColumn: "Sample",
      columns: [{ header: "Pb", analyteName: "Pb", unit: "mg/L" }],
      analyteColumn: "",
      valueColumn: "",
      longUnits: [],
      decimalSeparator: "point",
      csvDelimiter: "comma",
    });
    expect(r.status).toBe("error");
    expect((r as { message: string }).message).toContain("sheet");
  });
});

describe("decision 8: numeric-looking qualifier names are refused", () => {
  test("updateList rejects number-like and censored-looking names", async () => {
    const { admin, orgId } = await makeOrg();
    for (const bad of ["12", "1,5", "<x", "-3"]) {
      const r = await settingsApi.updateList(
        orgId,
        "resultQualifiers",
        { items: [], newName: bad },
        admin.email,
      );
      expect(r.status).toBe("error");
    }
    const ok = await settingsApi.updateList(
      orgId,
      "resultQualifiers",
      { items: [], newName: "n.b." },
      admin.email,
    );
    // "n.b." contains dots but also letters — it must stay allowed.
    expect(ok.status).toBe("success");
  });
});

describe("decision 12: an all-rejected import still stores its event", () => {
  test("unmatched rows confirm as 'nothing applied' with the event stored", async () => {
    const { admin } = await makeOrg();
    const { batch, configId } = await importFixture(admin);
    // The ID cell matches nothing in the batch → the row can only be skipped.
    const bytes = await workbookBytes("Results", [["Sample", "Pb"], ["UNKNOWN-1", "1.0"]]);
    const preview = await batchApi.previewImport(admin, batch.id, configId, { fileName: "e.xlsx", bytes });
    expect(preview.status).toBe("success");
    const { token, rows } = (
      preview as { preview: { token: string; rows: { rowNumber: number; match: { kind: string } }[] } }
    ).preview;
    // Every non-matched row is explicitly skipped with a typed reason.
    const resolutions = rows
      .filter((r) => r.match.kind !== "sample" && r.match.kind !== "qc")
      .map((r) => ({ rowNumber: r.rowNumber, action: "skip" as const, reason: "not in this batch" }));
    expect(resolutions.length).toBe(1);

    const importsBefore = batch.imports.length;
    const confirm = await batchApi.confirmImport(admin, batch.id, token, resolutions, [], false, "");
    expect(confirm.status).toBe("success");
    expect(batch.imports.length).toBe(importsBefore + 1);
    const event = batch.imports[batch.imports.length - 1];
    expect(event.rows.length).toBe(1);
    expect(event.file.sha256.length).toBe(64);
    expect(batch.events[batch.events.length - 1].summary).toContain("nothing applied");
    expect(batch.results.length).toBe(0); // nothing was written
  });
});

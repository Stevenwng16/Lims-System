import type { OrgSettings } from "@/lib/mock-db";

// Settings operations of US-A7. Mock behind an interface, real backend later.
// Every change must be audited with old + new value by the real backend (AC 8).

export type SettingsActionResult = { status: "success" } | { status: "error"; message: string };

export type ListEdit = {
  // Existing items by id: rename and/or (de)activate — never delete (AC 9).
  items: { id: string; name: string; active: boolean }[];
  // Optional new item to append.
  newName?: string;
};

export interface SettingsApi {
  getSettings(orgId: string): Promise<OrgSettings>;
  updateSecurity(orgId: string, security: OrgSettings["security"]): Promise<SettingsActionResult>;
  updateIdentifiers(
    orgId: string,
    identifiers: OrgSettings["identifiers"],
    jobLabel: string,
  ): Promise<SettingsActionResult>;
  updateList(
    orgId: string,
    list: "sampleTypes" | "resultQualifiers",
    edit: ListEdit,
  ): Promise<SettingsActionResult>;
  updateBarcode(orgId: string, barcode: OrgSettings["barcode"]): Promise<SettingsActionResult>;
  /** US-B3 AC 6: configurable calibration warning window (default 30 days). */
  updateEquipmentSettings(
    orgId: string,
    equipment: OrgSettings["equipment"],
  ): Promise<SettingsActionResult>;
  updateLabSettings(
    orgId: string,
    labId: string,
    settings: { analystsMayCreateBatches: boolean; reviewerMustDiffer: boolean },
  ): Promise<SettingsActionResult>;
}

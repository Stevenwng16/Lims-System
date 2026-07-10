import type { OrgSettings } from "@/lib/mock-db";

// Settings operations of US-A7. Mock behind an interface, real backend later.
// AC 8: every change is audited with the actor and old + new values — the
// mock writes these into OrgSettings.settingsEvents (append-only); previously
// this was deferred to "the real backend", which left the interface without
// even an actor to attribute the change to (pass-3 review fix). `actorEmail`
// is resolved server-side by the calling action, never trusted from a form.

export type SettingsActionResult = { status: "success" } | { status: "error"; message: string };

export type ListEdit = {
  // Existing items by id: rename and/or (de)activate — never delete (AC 9).
  items: { id: string; name: string; active: boolean }[];
  // Optional new item to append.
  newName?: string;
};

export interface SettingsApi {
  getSettings(orgId: string): Promise<OrgSettings>;
  updateSecurity(
    orgId: string,
    security: OrgSettings["security"],
    actorEmail: string,
  ): Promise<SettingsActionResult>;
  updateIdentifiers(
    orgId: string,
    identifiers: OrgSettings["identifiers"],
    jobLabel: string,
    actorEmail: string,
  ): Promise<SettingsActionResult>;
  updateList(
    orgId: string,
    list: "sampleTypes" | "resultQualifiers",
    edit: ListEdit,
    actorEmail: string,
  ): Promise<SettingsActionResult>;
  updateBarcode(
    orgId: string,
    barcode: OrgSettings["barcode"],
    actorEmail: string,
  ): Promise<SettingsActionResult>;
  /** US-B3 AC 6: configurable calibration warning window (default 30 days). */
  updateEquipmentSettings(
    orgId: string,
    equipment: OrgSettings["equipment"],
    actorEmail: string,
  ): Promise<SettingsActionResult>;
  updateLabSettings(
    orgId: string,
    labId: string,
    settings: { analystsMayCreateBatches: boolean; reviewerMustDiffer: boolean },
    actorEmail: string,
  ): Promise<SettingsActionResult>;
}

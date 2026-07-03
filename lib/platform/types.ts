import type { MockOrganisation } from "@/lib/mock-db";

// Vendor/tenant operations of US-A2. Like AuthApi, this is the swap surface:
// the mock lives in mock.ts, the real backend replaces it as an adapter.

// userCount derived live in listOrganisations; sessionActive derived from the
// grant's sessionExpiresAt so the console never shows a stale "active" flag.
export type OrganisationSummary = MockOrganisation & {
  userCount: number;
  supportSessionActive: boolean;
};

export type ActionResult = { status: "success" } | { status: "error"; message: string };

export interface PlatformApi {
  /** Vendor console list (US-A2 AC 12) — metadata only, never domain data (AC 10). */
  listOrganisations(): Promise<OrganisationSummary[]>;
  /** AC 4/5: creates the org with seeded defaults + invited first admin. */
  provisionOrganisation(name: string, adminEmail: string): Promise<ActionResult>;
  /** AC 6: reason required, nothing deleted. */
  suspendOrganisation(orgId: string, reason: string): Promise<ActionResult>;
  reactivateOrganisation(orgId: string, reason: string): Promise<ActionResult>;

  /** Customer side (AC 8): current grant for the session's own organisation. */
  getSupportGrant(orgId: string): Promise<MockOrganisation["supportGrant"]>;
  grantSupportAccess(orgId: string, durationHours: number, allowAdmin: boolean): Promise<ActionResult>;
  revokeSupportAccess(orgId: string): Promise<ActionResult>;

  /** Vendor side (AC 9): only with an active grant. Returns the grant expiry so
   * the session cookie can be capped to it (audit finding 5). */
  openSupportSession(
    orgId: string,
  ): Promise<ActionResult & { orgName?: string; allowAdmin?: boolean; grantExpiresAt?: number }>;
  endSupportSession(orgId: string): Promise<ActionResult>;
}

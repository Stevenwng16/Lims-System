import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeSession, SESSION_COOKIE } from "./session";
import type { SessionUser } from "./types";
import {
  decodeSupportSession,
  SUPPORT_COOKIE,
  type SupportSession,
} from "@/lib/platform/support-session";
import { platformApi } from "@/lib/platform";
import { effectiveOrgRole, type OrgRole } from "@/lib/permissions";
import { getOrgIdByName, mockDb } from "@/lib/mock-db";

// Shared server-side session resolver (audit findings 4/5/6). Every protected
// page and server action goes through here so that:
//  - a session is re-validated against the LIVE store on every request — a
//    demoted / deactivated / locked user, or a suspended org, takes effect
//    immediately, not only at next login (finding 4);
//  - a vendor support context is honoured ONLY for a platform-admin and ONLY
//    while the customer's grant is still active, with allowAdmin read from the
//    live grant so a revoke/downgrade lands on already-open sessions (find. 5);
//  - the support cookie's orgId can never redirect a *customer* user into
//    another tenant — the org override applies to platform-admins only (find. 6).
// (The mock DB is not reachable from edge middleware, so proxy.ts stays
// cookie-only for routing; these checks are the real boundary.)

export type OrgContext = {
  user: SessionUser; // role reflects the live record for org members
  orgId: string; // "" for a platform-admin with no active support session
  role: OrgRole | null; // effective role (support grant mapped via US-A4 AC 13)
  labs: string[]; // active-lab scoping source (lab names)
  support: SupportSession | null; // validated: grant still active, allowAdmin live
  isSupport: boolean;
};

async function validatedSupport(user: SessionUser): Promise<SupportSession | null> {
  if (user.role !== "platform-admin") return null;
  const cookieStore = await cookies();
  const raw = decodeSupportSession(cookieStore.get(SUPPORT_COOKIE)?.value);
  if (!raw) return null;
  const grant = await platformApi.getSupportGrant(raw.orgId); // null once revoked/expired
  if (!grant) return null;
  return { ...raw, allowAdmin: grant.allowAdmin }; // live rights, not the cookie's
}

/** Resolve + live-validate the session. Redirects to /login on a dead session. */
export async function resolveOrgContext(): Promise<OrgContext> {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");

  if (session.user.role !== "platform-admin") {
    // Live re-validation for org members (finding 4). Dead sessions go to the
    // /session-expired route handler, which clears the cookie — a plain
    // redirect("/login") would loop, since proxy bounces cookie-carrying
    // requests off /login (Fable re-review finding 1).
    const record = mockDb.users.get(session.user.email);
    if (!record || record.status === "inactive" || record.locked) redirect("/session-expired");
    // An org member is never a platform-admin; a mismatch means a corrupt
    // session — treat as dead.
    if (record.role === "platform-admin") redirect("/session-expired");
    const liveRole: OrgRole = record.role;
    const orgId = getOrgIdByName(session.user.organisation);
    if (!orgId || mockDb.organisations.get(orgId)?.status !== "active") {
      redirect("/session-expired");
    }
    return {
      user: { ...session.user, role: liveRole }, // trust the live role
      orgId,
      role: liveRole,
      labs: record.labs,
      support: null,
      isSupport: false,
    };
  }

  // Platform admin: live-revalidate the account itself too (Fable re-review
  // finding 23), then resolve the customer org context only via a validated
  // support session — it never leaks to any other user (finding 6).
  const platformRecord = mockDb.users.get(session.user.email);
  if (
    !platformRecord ||
    platformRecord.role !== "platform-admin" ||
    platformRecord.status === "inactive" ||
    platformRecord.locked
  ) {
    redirect("/session-expired");
  }
  const support = await validatedSupport(session.user);
  const empty: OrgContext = {
    user: session.user,
    orgId: "",
    role: null,
    labs: [],
    support: null,
    isSupport: false,
  };
  if (!support) return empty;
  if (mockDb.organisations.get(support.orgId)?.status !== "active") return empty;
  return {
    user: session.user,
    orgId: support.orgId,
    role: effectiveOrgRole(session.user, support),
    labs: [...mockDb.labs.values()].filter((l) => l.orgId === support.orgId).map((l) => l.name),
    support,
    isSupport: true,
  };
}

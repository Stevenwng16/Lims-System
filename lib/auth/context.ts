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
import { authApi } from "@/lib/auth";
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

  // Live re-validation through the ACTIVE auth backend (finding 4) — never
  // straight against the mock store, or a Supabase-authenticated user would
  // be judged dead on every request. Dead sessions go to the /session-expired
  // route handler, which clears the cookie — a plain redirect("/login") would
  // loop, since proxy bounces cookie-carrying requests off /login (Fable
  // re-review finding 1).
  const live = await authApi.validateSession(session.user);
  if (!live) redirect("/session-expired");
  // The cookie and the live record must agree on which SIDE of the
  // platform/customer boundary the account lives — a mismatch means a corrupt
  // session, treat as dead.
  if ((live.user.role === "platform-admin") !== (session.user.role === "platform-admin")) {
    redirect("/session-expired");
  }

  if (live.user.role !== "platform-admin") {
    const liveRole: OrgRole = live.user.role;
    const orgId = getOrgIdByName(live.user.organisation);
    if (!orgId || mockDb.organisations.get(orgId)?.status !== "active") {
      console.warn(
        `[auth] resolveOrgContext: organisation "${live.user.organisation}" ` +
          (orgId ? "is not active" : "has no domain-data counterpart (mock org name mismatch)"),
      );
      redirect("/session-expired");
    }
    return {
      user: live.user, // trust the live record, not the cookie snapshot
      orgId,
      role: liveRole,
      labs:
        live.labs ??
        [...mockDb.labs.values()].filter((l) => l.orgId === orgId).map((l) => l.name),
      support: null,
      isSupport: false,
    };
  }

  // Platform admin (already live-revalidated above, Fable re-review finding
  // 23): resolve the customer org context only via a validated support
  // session — it never leaks to any other user (finding 6).
  const support = await validatedSupport(live.user);
  const empty: OrgContext = {
    user: live.user,
    orgId: "",
    role: null,
    labs: [],
    support: null,
    isSupport: false,
  };
  if (!support) return empty;
  if (mockDb.organisations.get(support.orgId)?.status !== "active") return empty;
  return {
    user: live.user,
    orgId: support.orgId,
    role: effectiveOrgRole(live.user, support),
    labs: [...mockDb.labs.values()].filter((l) => l.orgId === support.orgId).map((l) => l.name),
    support,
    isSupport: true,
  };
}

import { redirect } from "next/navigation";
import { resolveOrgContext } from "@/lib/auth/context";
import { labApi } from "@/lib/labs";

// US-A3 AC 5 / US-C2 AC 1: once the Job overview exists, it is the landing page
// after login. The phase-1 placeholder home is retired; "/" lands on /jobs.
// (A per-organisation dashboard may replace this in epic G.)
export default async function HomePage() {
  const ctx = await resolveOrgContext(); // live-validates; redirects a dead session
  // A platform-admin with no valid support context has role null — send them to
  // the vendor console, NOT into the customer app (else "/" ↔ "/jobs" would
  // loop, because /jobs redirects a role-null actor back to "/"; audit find. 6).
  if (ctx.role === null) redirect("/platform");
  // First-run setup (13 Jul 2026 decision): a freshly provisioned org has ZERO
  // labs — its admin creates the real first lab before anything else. Only
  // admins can reach this state (users cannot exist without a lab assignment,
  // and the last active lab can never be deactivated), and /setup redirects
  // back here once a lab exists, so the two conditions can never loop.
  if (ctx.role === "admin" && (await labApi.listLabs(ctx.orgId)).length === 0) {
    redirect("/setup");
  }
  redirect("/jobs");
}

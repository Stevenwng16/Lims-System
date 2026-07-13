import { redirect } from "next/navigation";
import { resolveOrgContext } from "@/lib/auth/context";
import { labApi } from "@/lib/labs";
import { getOrgSettings } from "@/lib/mock-db";
import { SetupForm } from "./setup-client";

export const metadata = { title: "Set up your organisation" };

// First-run setup (US-A2 AC 4; 13 Jul 2026 decision): a freshly provisioned
// organisation has ZERO labs — the invited admin lands here (via "/") and
// creates the real first lab. Only reachable in that state: with labs
// present, or for non-admins, this page bounces straight back.
export default async function SetupPage() {
  const ctx = await resolveOrgContext(); // live-validates; handles dead sessions
  if (ctx.role !== "admin" || !ctx.orgId) redirect("/");
  const labs = await labApi.listLabs(ctx.orgId);
  if (labs.length > 0) redirect("/"); // setup done — never shown again

  return (
    <div className="mx-auto max-w-3xl py-10">
      <SetupForm
        organisationName={ctx.user.organisation}
        // The org's REAL batch template (US-A7 AC 3, invariant 7), so the
        // live example under the code field shows exactly what will be
        // stamped. Jobs are org-wide — only batch numbers carry the lab code.
        batchFormat={getOrgSettings(ctx.orgId).identifiers.batchFormat}
      />
    </div>
  );
}

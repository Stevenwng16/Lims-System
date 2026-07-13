import { redirect } from "next/navigation";
import { resolveOrgContext } from "@/lib/auth/context";
import { labApi } from "@/lib/labs";
import { SetupForm } from "./setup-client";

export const metadata = { title: "Set up your organisation — LIMS" };

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
      <SetupForm organisationName={ctx.user.organisation} />
    </div>
  );
}

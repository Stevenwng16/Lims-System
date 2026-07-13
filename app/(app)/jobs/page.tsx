import Link from "next/link";
import { cookies } from "next/headers";
import { jobApi } from "@/lib/jobs";
import { methodApi } from "@/lib/methods";
import { activeLabsForUser, LAB_COOKIE, resolveActiveLab } from "@/lib/lab";
import { getOrgSettings } from "@/lib/mock-db";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getOrgIdByName } from "@/lib/mock-db";
import { resolveJobActor } from "./actions";
import { JobOverview } from "./job-overview";

// Browser-tab title uses the configured job label (US-C2 AC 2 — Fable
// re-review finding 15).
export async function generateMetadata() {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  const orgId = session ? getOrgIdByName(session.user.organisation) : null;
  const label = orgId ? getOrgSettings(orgId).jobLabel : "Job";
  return { title: `${label}s` };
}

// US-C2 Job overview — the post-login landing page (US-A3 AC 5). Read-only,
// filtered to jobs with work in the active lab shown in the shell (AC 1 as
// amended 13 Jul 2026 — jobs are org-wide; admins default to "All labs").
// Switching labs happens in the shell, not here.
export default async function JobsPage() {
  const actor = await resolveJobActor();
  const settings = getOrgSettings(actor.orgId);
  const jobLabel = settings.jobLabel;
  const canCreate = actor.role === "admin" || actor.role === "lab-manager";

  // Active lab from the shell (AC 1). A vendor support session is org-wide;
  // so is an admin's "All labs" view (13 Jul 2026 decision) — activeLab null
  // means org-wide for both.
  const cookieStore = await cookies();
  const activeLab = actor.isSupport
    ? null
    : resolveActiveLab(
        activeLabsForUser(actor.labs, actor.orgId, actor.role),
        cookieStore.get(LAB_COOKIE)?.value,
        actor.role === "admin",
      );

  const rows = await jobApi.jobOverview(actor, activeLab?.id ?? null);

  const typeOptions = settings.sampleTypes
    .filter((t) => t.active)
    .map((t) => ({ id: t.id, label: t.name }));
  const methodOptions = (await methodApi.listMethods(actor)).map((m) => ({
    id: m.id,
    label: `${m.name} (${m.code})`,
  }));
  // Built from the already active-lab-scoped rows, so the customer filter stays
  // tenant- and lab-scoped (AC 4).
  const customerOptions = [...new Set(rows.map((r) => r.customer))]
    .sort()
    .map((c) => ({ id: c, label: c }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{jobLabel}s</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{jobLabel}s</h1>
          <p className="text-sm text-muted-foreground">
            {actor.isSupport
              ? "All labs (support session)"
              : activeLab
                ? `${activeLab.name} lab`
                : actor.role === "admin"
                  ? "All labs"
                  : "No active lab"}
          </p>
        </div>
        {canCreate && (
          <Button size="sm" render={<Link href="/jobs/new" />}>
            + New {jobLabel.toLowerCase()}
          </Button>
        )}
      </div>

      <JobOverview
        jobLabel={jobLabel}
        rows={rows}
        typeOptions={typeOptions}
        methodOptions={methodOptions}
        customerOptions={customerOptions}
      />
    </div>
  );
}

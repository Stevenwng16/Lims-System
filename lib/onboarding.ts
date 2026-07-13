import { getOrgSettings, mockDb } from "@/lib/mock-db";

// First-run guidance (13 Jul 2026): fresh organisations start with EMPTY
// org-specific lists, so the admin's path to the first job is invisible
// without a map. The checklist is DERIVED live from the store on every
// render — deliberately NO stored onboarding state (nothing to audit,
// nothing to drift) — and the card disappears once the essential steps
// exist. Presentation only: nothing is ever gated on it.

export type GettingStartedStep = {
  key: string;
  label: string;
  href: string;
  done: boolean;
  optional?: boolean;
};

export function gettingStartedSteps(orgId: string): {
  steps: GettingStartedStep[];
  /** True once every non-optional step is done — the card hides itself. */
  complete: boolean;
} {
  const settings = getOrgSettings(orgId);
  const hasLab = [...mockDb.labs.values()].some((l) => l.orgId === orgId && l.status === "active");
  const hasTypes = settings.sampleTypes.some((t) => t.active);
  const hasMethod = [...mockDb.methods.values()].some(
    (m) => m.orgId === orgId && m.status === "active",
  );
  const hasEquipment = [...mockDb.equipment.values()].some((e) => e.orgId === orgId);
  const hasColleagues = [...mockDb.users.values()].filter((u) => u.orgId === orgId).length > 1;
  const hasJob = [...mockDb.jobs.values()].some((j) => j.orgId === orgId);

  const steps: GettingStartedStep[] = [
    { key: "lab", label: "Create your first lab", href: "/admin/labs", done: hasLab },
    { key: "sample-types", label: "Add sample types", href: "/settings", done: hasTypes },
    { key: "method", label: "Create your first method", href: "/methods/new", done: hasMethod },
    {
      key: "equipment",
      label: "Add equipment types & equipment",
      href: "/quality/equipment",
      done: hasEquipment,
      optional: true,
    },
    { key: "users", label: "Invite colleagues", href: "/admin/users", done: hasColleagues, optional: true },
    {
      key: "job",
      label: `Register your first ${settings.jobLabel.toLowerCase()}`,
      href: "/jobs/new",
      done: hasJob,
    },
  ];
  return { steps, complete: steps.every((s) => s.optional || s.done) };
}

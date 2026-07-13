"use server";

import { redirect } from "next/navigation";
import { labApi } from "@/lib/labs";
import { resolveOrgContext } from "@/lib/auth/context";

export type SetupFormState = { error?: string };

// First-run setup (US-A2 AC 4; 13 Jul 2026 decision replacing US-A5 AC 8's
// seeded default lab): the invited admin creates the organisation's REAL
// first lab — its code is stamped into every job/batch identifier, so no
// placeholder is ever minted. createLab completes setup (org.setupPending)
// and assigns the creator to the new lab (see lib/labs/mock.ts).
export async function createFirstLabAction(
  _prev: SetupFormState,
  formData: FormData,
): Promise<SetupFormState> {
  const ctx = await resolveOrgContext();
  // Same gate as lab management (US-A5 authorization): Admin only — incl. a
  // support session with admin rights (US-A4 AC 13), like /admin/labs.
  if (ctx.role !== "admin" || !ctx.orgId) redirect("/");

  const result = await labApi.createLab(
    ctx.orgId,
    {
      name: String(formData.get("name") ?? ""),
      code: String(formData.get("code") ?? ""),
      description: String(formData.get("description") ?? ""),
    },
    ctx.user.email,
  );
  if (result.status === "error") return { error: result.message };
  // The new lab is the creator's only assignment, so the active-lab resolver
  // picks it automatically — straight into the job overview.
  redirect("/");
}

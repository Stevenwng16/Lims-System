import { labApi } from "@/lib/labs";
import { methodApi } from "@/lib/methods";
import { userApi } from "@/lib/users";
import { currentMethodVersion, mockDb } from "@/lib/mock-db";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { resolveActor } from "./actions";
import { UsersClient } from "./users-client";

export const metadata = { title: "Users — LIMS" };

// Admin ▸ Users (US-A6). Admins see all users of the organisation; lab
// managers only those in their own lab(s), and only Analyst/Read-only are
// theirs to manage (AC 1/10).
export default async function UsersPage() {
  const actor = await resolveActor(); // redirects when not admin/lab manager

  const users = await userApi.listUsers(actor);
  const allLabs = await labApi.listLabs(actor.orgId);
  // Clearances are granted per method and stored by method ID (US-B1 AC 12) —
  // stable across renames and versions. Grantable here: active methods within
  // the actor's scope; anything else a user holds is display-only and survives
  // saves untouched (merge in lib/users/mock.ts).
  const clearanceOptions = (await methodApi.listMethods(actor))
    .filter((m) => m.status === "active")
    .map((m) => ({ id: m.id, label: `${m.name} (${m.code})` }));
  // Labels for held clearances outside the options (inactive / other lab).
  const methodLabels: Record<string, string> = {};
  for (const method of mockDb.methods.values()) {
    if (method.orgId !== actor.orgId) continue;
    const v = currentMethodVersion(method);
    methodLabels[method.id] =
      `${v.name} (${v.code})${method.status === "inactive" ? " — inactive" : ""}`;
  }
  // New assignments only to active labs (US-A5 AC 4); lab managers only
  // within their own lab(s) (AC 10).
  const assignableLabs = allLabs
    .filter((lab) => lab.status === "active")
    .map((lab) => lab.name)
    .filter((name) => actor.role === "admin" || actor.labs.includes(name));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/jobs">Jobs</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>Admin</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Users</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <UsersClient
        users={users}
        assignableLabs={assignableLabs}
        methods={clearanceOptions}
        methodLabels={methodLabels}
        actorRole={actor.role}
        actorEmail={actor.email}
      />
    </div>
  );
}

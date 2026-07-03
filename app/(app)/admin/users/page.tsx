import { labApi } from "@/lib/labs";
import { userApi } from "@/lib/users";
import { MOCK_METHODS } from "@/lib/mock-db";
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
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
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
        methods={[...MOCK_METHODS]}
        actorRole={actor.role}
        actorEmail={actor.email}
      />
    </div>
  );
}

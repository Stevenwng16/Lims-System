import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { platformApi } from "@/lib/platform";
import { SupportAccessForm } from "./support-access-form";

export const metadata = { title: "Support access — LIMS" };

// Customer side of US-A2 AC 8/9. Lives under Settings; the full Settings
// area arrives with US-A7 — until then this page stands alone.
export default async function SupportAccessPage() {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (session?.user.role !== "org-admin") redirect("/");

  const orgId = session.user.organisation === "Demo Lab" ? "org-demolab" : "org-unknown";
  const grant = await platformApi.getSupportGrant(orgId);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
        <div>
          <Link
            href="/"
            className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
          >
            ← Back to dashboard
          </Link>
        </div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Vendor support access
        </h1>
        <SupportAccessForm
          grant={
            grant && {
              expiresAt: grant.expiresAt,
              allowAdmin: grant.allowAdmin,
              sessionActive: grant.sessionActive,
            }
          }
        />
      </main>
    </div>
  );
}

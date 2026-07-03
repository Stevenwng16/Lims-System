// Phase-1 landing page (US-A3 AC 5): org, active lab, role, links to available
// sections. Replaced by the Job overview (US-C2) as landing once it exists.
// The stat tiles and jobs table below are placeholder mock data.
import Link from "next/link";
import { cookies } from "next/headers";
import { resolveOrgContext } from "@/lib/auth/context";
import { activeLabsForUser, LAB_COOKIE, resolveActiveLab } from "@/lib/lab";
import { adminNav, mainNav, visibleNav } from "@/lib/navigation";
import { ROLE_LABELS } from "@/lib/permissions";

const stats = [
  { label: "Open jobs", value: 14, hint: "3 due this week" },
  { label: "Samples awaiting receipt", value: 27, hint: "oldest 2 days" },
  { label: "Batches in progress", value: 5, hint: "2 awaiting review" },
  { label: "Results awaiting review", value: 41, hint: "across 4 methods" },
];

const recentJobs = [
  { id: "J-2026-0142", client: "Aqualab Noord", samples: 12, status: "In progress", due: "7 Jul 2026" },
  { id: "J-2026-0141", client: "Bodemcheck BV", samples: 4, status: "Awaiting review", due: "6 Jul 2026" },
  { id: "J-2026-0140", client: "Van Dijk Milieu", samples: 8, status: "In progress", due: "8 Jul 2026" },
  { id: "J-2026-0139", client: "Aqualab Noord", samples: 21, status: "Registered", due: "10 Jul 2026" },
  { id: "J-2026-0138", client: "Provincie Utrecht", samples: 6, status: "Completed", due: "3 Jul 2026" },
  { id: "J-2026-0137", client: "Bodemcheck BV", samples: 9, status: "Completed", due: "2 Jul 2026" },
];

const statusStyles: Record<string, string> = {
  Registered: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "In progress": "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  "Awaiting review": "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Completed: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
};

export default async function HomePage() {
  const ctx = await resolveOrgContext();
  const { user } = ctx;
  const cookieStore = await cookies();

  const assignedLabs = ctx.isSupport ? [] : activeLabsForUser(ctx.labs, ctx.orgId);
  const activeLab = resolveActiveLab(assignedLabs, cookieStore.get(LAB_COOKIE)?.value);

  // Section links from the shared nav config, so every role sees exactly the
  // sections they can reach and the list grows with the sidebar (finding 14).
  const sections = [...visibleNav(mainNav, ctx.role), ...visibleNav(adminNav, ctx.role)].filter(
    (item) => item.href !== "/",
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section>
        <h1 className="text-xl font-semibold text-foreground">
          Welcome, {user.name.split(" ")[0]} — {ctx.isSupport ? ctx.support?.orgName : user.organisation}
          {activeLab && ` · ${activeLab.name} lab`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Role: {ROLE_LABELS[user.role]}
        </p>
        {sections.length > 0 && (
          <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {sections.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-primary underline-offset-4 hover:underline"
              >
                {item.title}
              </Link>
            ))}
          </nav>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Today <span className="normal-case">(placeholder — mock data)</span>
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border bg-card p-5">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground/70">{s.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Recent jobs <span className="normal-case">(placeholder — mock data)</span>
        </h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Job</th>
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium text-right">Samples</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((job) => (
                <tr key={job.id} className="border-b last:border-0">
                  <td className="px-5 py-3 font-medium tabular-nums text-foreground">{job.id}</td>
                  <td className="px-5 py-3 text-muted-foreground">{job.client}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                    {job.samples}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[job.status]}`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{job.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

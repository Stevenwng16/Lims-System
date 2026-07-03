// Placeholder dashboard with mock data — the real screens are built story by
// story (navigation shell: US-A3, job overview: US-C2, dashboards: epic G).

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

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              LIMS
            </span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Demo Lab · Schiedam
            </span>
          </div>
          <span className="rounded-full border border-dashed border-zinc-300 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Placeholder — mock data
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <section>
          <h1 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Today
          </h1>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{s.label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {s.value}
                </p>
                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{s.hint}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Recent jobs
          </h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-5 py-3 font-medium">Job</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium text-right">Samples</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Due</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/50"
                  >
                    <td className="px-5 py-3 font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                      {job.id}
                    </td>
                    <td className="px-5 py-3 text-zinc-600 dark:text-zinc-300">{job.client}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                      {job.samples}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[job.status]}`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-600 dark:text-zinc-300">{job.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

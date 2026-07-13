// TEMPORARY dev aid: demo credentials for the mock backend, shown on the
// login screen. Renders only in development builds; delete this file (and its
// usage in page.tsx) once the real backend replaces the mock.

const demoAccounts = [
  { email: "admin@demolab.nl", note: "Admin, 2 labs (switcher)" },
  { email: "labmanager@demolab.nl", note: "Lab manager, Metals lab" },
  { email: "analyst@demolab.nl", note: "Analyst, MFA — code 123456" },
  { email: "readonly@demolab.nl", note: "Read-only" },
  { email: "vendor@lims.dev", note: "platform admin → vendor console" },
  { email: "user@oldcust.nl", note: "member of suspended org" },
];

// Clean start (LIMS_CLEAN_SEED=1): only the vendor account exists — listing
// the demo dataset's accounts would advertise logins that don't work.
const cleanAccounts = [{ email: "vendor@lims.dev", note: "platform admin → vendor console" }];

export function DemoAccounts() {
  if (process.env.NODE_ENV === "production") return null;
  const clean = process.env.LIMS_CLEAN_SEED === "1";
  const accounts = clean ? cleanAccounts : demoAccounts;

  return (
    <div className="mt-6 rounded-lg border border-dashed border-zinc-300 p-4 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      <p className="mb-2 font-medium uppercase tracking-wide">
        {clean ? "Clean start (dev only)" : "Demo accounts (dev only)"}
      </p>
      <ul className="space-y-1">
        {accounts.map((a) => (
          <li key={a.email} className="flex justify-between gap-4">
            <span className="font-mono">{a.email}</span>
            <span className="text-right">{a.note}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2">
        Password{clean ? "" : " (all)"}: <span className="font-mono">LabDemo2026!!</span> · 5 wrong
        attempts locks an account · reset token: <span className="font-mono">demo-reset-token</span>{" "}
        (link printed in the dev-server console)
      </p>
      {clean && (
        <p className="mt-2">
          Provision an organisation from the vendor console — its first admin logs in with the
          invited email and the password above (each further account you create uses it too).
        </p>
      )}
    </div>
  );
}

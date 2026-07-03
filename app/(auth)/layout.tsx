// Plain, single-purpose screens — no navigation shell before authentication
// (US-A1; the shell arrives with US-A3).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="mb-8 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        LIMS
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

// Plain, single-purpose screens — no navigation shell before authentication
// (US-A1; the shell arrives with US-A3).
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="mb-8 text-2xl font-semibold tracking-tight text-primary">LIMS</div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

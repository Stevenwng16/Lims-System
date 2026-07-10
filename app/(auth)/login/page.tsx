import { DemoAccounts } from "./demo-accounts";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in — LIMS" };

export default function LoginPage() {
  return (
    <>
      <LoginForm />
      {/* Demo credentials belong to the in-memory mock only. Same env switch
          as the authApi swap point (lib/auth/index.ts): with the Supabase
          backend active these accounts don't exist, and a login page must
          never enumerate real accounts — so the box disappears entirely. */}
      {!process.env.NEXT_PUBLIC_SUPABASE_URL && <DemoAccounts />}
    </>
  );
}

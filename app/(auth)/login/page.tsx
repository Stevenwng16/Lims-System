import { DemoAccounts } from "./demo-accounts";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in — LIMS" };

export default function LoginPage() {
  return (
    <>
      <LoginForm />
      <DemoAccounts />
    </>
  );
}

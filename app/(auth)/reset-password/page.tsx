import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Reset password — LIMS" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={token ?? ""} />;
}

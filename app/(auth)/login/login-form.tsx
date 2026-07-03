"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, verifyMfaAction, type AuthFormState } from "../actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthFormState = {};

export function LoginForm() {
  const [loginState, login, loginPending] = useActionState(loginAction, initialState);
  const [mfaState, verifyMfa, mfaPending] = useActionState(verifyMfaAction, initialState);

  // After a correct password, the org requires the second factor before the
  // session starts (AC 5).
  const mfaToken = mfaState.mfaToken ?? loginState.mfaToken;

  if (mfaToken) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Two-factor verification</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={verifyMfa} className="space-y-4">
            <input type="hidden" name="mfaToken" value={mfaToken} />
            <div className="space-y-2">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                className="text-center text-lg tracking-[0.5em]"
              />
            </div>
            {mfaState.error && (
              <Alert variant="destructive">
                <AlertDescription>{mfaState.error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={mfaPending}>
              {mfaPending ? "Verifying…" : "Verify"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>Sign in with your personal account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={login} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {loginState.error && (
            <Alert variant="destructive">
              <AlertDescription>{loginState.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={loginPending}>
            {loginPending ? "Logging in…" : "Log in"}
          </Button>
          <div className="text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
            >
              Forgot password?
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

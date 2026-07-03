"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, type AuthFormState } from "../actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthFormState = {};

export function ForgotPasswordForm() {
  const [state, submit, pending] = useActionState(forgotPasswordAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>
          Enter your email address and we&apos;ll send you a time-limited reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.info ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>{state.info}</AlertDescription>
            </Alert>
            <Button render={<Link href="/login" />} variant="outline" className="w-full">
              Back to login
            </Button>
          </div>
        ) : (
          <form action={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
            </div>
            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </Button>
            <div className="text-center">
              <Link
                href="/login"
                className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
              >
                Back to login
              </Link>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

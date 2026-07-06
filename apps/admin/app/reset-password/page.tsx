"use client";

import { ApiError } from "@pg/api-client";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";

/**
 * Password-reset page. Reads `?token=` from the URL — the link emailed by the
 * forgot-password flow. Must be wrapped in <Suspense> or next build (static
 * export) fails because useSearchParams() requires it.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const router = useRouter();
  const toast = useToast();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const valid = token.length > 0 && next.length >= 8 && next === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    try {
      await api.auth.resetPassword({ token, newPassword: next });
      router.replace("/login?reset=1");
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 401
          ? "This reset link is invalid or has expired. Please request a new one."
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted px-4 py-10">
        <div className="w-full max-w-sm text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Invalid reset link. Please request a new one.
          </p>
          <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">
            Forgot password?
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-brand-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Set a new password</h1>
          <p className="text-sm text-muted-foreground">
            Choose a strong password of at least 8 characters.
          </p>
        </div>

        <Card>
          <CardContent className="pt-5">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-pw">New password</Label>
                <Input
                  id="new-pw"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pw">Confirm new password</Label>
                <Input
                  id="confirm-pw"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                />
                {mismatch && (
                  <p className="text-xs text-danger">Passwords do not match.</p>
                )}
              </div>

              <Button type="submit" className="w-full" loading={submitting} disabled={!valid}>
                Set new password
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                <Link href="/login" className="hover:text-foreground">
                  Back to sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

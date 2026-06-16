"use client";

import { ApiError } from "@pg/api-client";
import { Building2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api, needsPasswordChange, setTokens } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Forced-password-change page. Shown to managers whose password was set by an
 * owner (temp password). The manager must pick their own password here before
 * they can access the app. Lives outside the (app) shell so the gate in
 * (app)/layout.tsx can redirect here before the shell is mounted.
 */
export default function ChangePasswordPage() {
  const { user, loading, refreshUser, refreshBranding } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (!needsPasswordChange(user)) {
      // Already has their own password — this page is only for forced change.
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const valid = current.length >= 8 && next.length >= 8 && next === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    try {
      const tokens = await api.auth.changePassword({
        currentPassword: current,
        newPassword: next,
      });
      // Swap tokens before navigating so the new JWT (without mustChangePassword)
      // is what the auth context reads on the dashboard.
      setTokens(tokens);
      refreshUser();
      await refreshBranding();
      router.replace("/dashboard");
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 401
          ? "Temporary password is incorrect."
          : "Could not set password. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user || !needsPasswordChange(user)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-brand-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Set your password</h1>
          <p className="text-sm text-muted-foreground">
            Your account was created with a temporary password. Please set a
            permanent password to continue.
          </p>
        </div>

        <Card>
          <CardContent className="pt-5">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="temp-pw">Temporary password</Label>
                <Input
                  id="temp-pw"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
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

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !valid}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Set password & continue
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Paying-guest management, simplified.
        </p>
      </div>
    </div>
  );
}

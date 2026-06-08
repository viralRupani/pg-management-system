"use client";

import { ApiError } from "@pg/api-client";
import { Building2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { currentUser, landingPath } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Manager login. Deliberately NEUTRAL branding — we don't know the tenant until
 * the JWT comes back, so there's no slug to theme from. The PG's own colours
 * appear after login, painted from GET /tenants/branding.
 */
export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in → skip the form (owners land on the PG chooser).
  useEffect(() => {
    if (!loading && user) router.replace(landingPath(user));
  }, [user, loading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace(landingPath(currentUser()));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Incorrect email or password."
          : "Could not sign in. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-brand-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">PG Manager</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your dashboard
          </p>
        </div>

        <Card>
          <CardContent className="pt-5">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourpg.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in
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

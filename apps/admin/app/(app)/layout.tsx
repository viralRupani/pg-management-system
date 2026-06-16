"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { needsPasswordChange, needsPgSelection } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Client-side route guard for the authenticated area (static export → no
 * server middleware; the guard lives here and the API enforces the real rules). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (needsPasswordChange(user)) {
      // Manager who was assigned a temp password: must set their own before use.
      router.replace("/change-password");
    } else if (needsPgSelection(user)) {
      // Owner without an active PG: the dashboard needs a tenant → send to the
      // PG chooser (which lives outside this authenticated app shell).
      router.replace("/pgs");
    }
  }, [user, loading, router]);

  if (loading || !user || needsPasswordChange(user) || needsPgSelection(user)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}

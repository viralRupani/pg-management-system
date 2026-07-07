"use client";

import { UserRole } from "@pg/shared";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import {
  needsPasswordChange,
  needsPgSelection,
  needsTcAcceptance,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Client-side route guard for the authenticated area (static export → no
 * server middleware; the guard lives here and the API enforces the real rules). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, termsPending, tcLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for BOTH auth hydration and the T&C status fetch so a manager doesn't
    // flash the dashboard before the gate resolves.
    if (loading || tcLoading) return;
    if (!user) {
      router.replace("/login");
    } else if (needsPasswordChange(user)) {
      // Manager who was assigned a temp password: must set their own before use.
      router.replace("/change-password");
    } else if (user.role === UserRole.PLATFORM_ADMIN) {
      // Platform admin has no tenant → the manager shell (nav assumes a tenant)
      // is not for them. Send them to their own console.
      router.replace("/terms-admin");
    } else if (needsTcAcceptance(user, termsPending)) {
      // Owner/manager who hasn't accepted the latest Terms & Conditions.
      router.replace("/terms");
    } else if (needsPgSelection(user)) {
      // Owner without an active PG: the dashboard needs a tenant → send to the
      // PG chooser (which lives outside this authenticated app shell).
      router.replace("/pgs");
    }
  }, [user, loading, tcLoading, termsPending, router]);

  if (
    loading ||
    tcLoading ||
    !user ||
    needsPasswordChange(user) ||
    user.role === UserRole.PLATFORM_ADMIN ||
    needsTcAcceptance(user, termsPending) ||
    needsPgSelection(user)
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}

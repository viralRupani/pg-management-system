"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";

/** Client-side route guard for the authenticated area (static export → no
 * server middleware; the guard lives here and the API enforces the real rules). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}

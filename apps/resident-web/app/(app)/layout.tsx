"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { BottomTabs } from "@/components/bottom-tabs";
import { useAuth } from "@/lib/auth";

/**
 * Client route guard for the authenticated area (static export → no server
 * middleware; the guard lives here and the API enforces the real rules). Wraps
 * children in the centered mobile column with the fixed bottom-tab bar.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink3">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-[480px] bg-page pb-[68px]">
      {children}
      <BottomTabs />
    </div>
  );
}

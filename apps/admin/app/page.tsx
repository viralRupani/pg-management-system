"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { landingPath } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Entry point: bounce to the chooser/dashboard or login once auth has hydrated. */
export default function Home() {
  const { user, loading, termsPending, tcLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || tcLoading) return;
    router.replace(user ? landingPath(user, termsPending) : "/login");
  }, [user, loading, tcLoading, termsPending, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Loading…
    </div>
  );
}

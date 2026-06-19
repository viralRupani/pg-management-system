"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth";

/** Root gate: route to the app or the login flow once auth has hydrated. */
export default function Index() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(isAuthenticated ? "/home" : "/login");
  }, [isAuthenticated, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-ink3">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

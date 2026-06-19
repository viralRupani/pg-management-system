"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./query";

/** Client boundary for TanStack Query (the root layout is a server component). */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

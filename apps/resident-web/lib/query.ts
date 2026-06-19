import { QueryClient } from "@tanstack/react-query";

/**
 * Single TanStack Query client. Resident screens are read-heavy (invoices,
 * deposits, complaints, announcements), so a modest staleTime + one retry is a
 * sane default; tune per-query as needed (e.g. the complaint thread polls).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

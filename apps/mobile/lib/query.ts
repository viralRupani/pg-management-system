import { QueryClient } from '@tanstack/react-query';

/**
 * Single TanStack Query client for the app. Resident screens are read-heavy
 * (invoices, deposits, complaints, announcements) with pull-to-refresh, so a
 * modest staleTime + one retry is a sane default; tune per-query as needed.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

/**
 * Centralized query keys + read hooks over the resident api-client. Mutations
 * stay screen-local (they invalidate these keys). Keeps cache invalidation
 * consistent across screens (e.g. submitting a payment invalidates `invoices`).
 */
export const qk = {
  invoices: ['invoices', 'mine'] as const,
  deposit: ['deposit', 'mine'] as const,
  documents: ['documents', 'mine'] as const,
  complaints: ['complaints', 'mine'] as const,
  complaintThread: (id: string) => ['complaints', id, 'updates'] as const,
  announcements: (q?: string) => ['announcements', q ?? ''] as const,
  menuConfig: ['menu', 'config'] as const,
  menu: (from: string, to: string) => ['menu', from, to] as const,
  notifications: ['notifications'] as const,
  paymentInfo: ['tenant', 'payment-info'] as const,
};

export const useInvoices = () =>
  useQuery({ queryKey: qk.invoices, queryFn: () => api.resident.invoices.listMine() });

export const useDeposit = () =>
  useQuery({ queryKey: qk.deposit, queryFn: () => api.resident.deposits.mine() });

export const useDocuments = () =>
  useQuery({ queryKey: qk.documents, queryFn: () => api.resident.documents.listMine() });

export const useComplaints = () =>
  useQuery({ queryKey: qk.complaints, queryFn: () => api.resident.complaints.listMine() });

// Polls every 3s so a manager's reply appears without a manual refresh — feels
// like live chat. The interval is owned by the query observer, so it only runs
// while the thread screen is mounted (it stops the moment the resident taps
// back) and pauses while the app is backgrounded (refetchIntervalInBackground
// defaults false).
export const useComplaintThread = (id: string) =>
  useQuery({
    queryKey: qk.complaintThread(id),
    queryFn: () => api.resident.complaints.updates(id),
    enabled: !!id,
    refetchInterval: 3000,
  });

export const useAnnouncements = (q?: string) =>
  useQuery({
    queryKey: qk.announcements(q),
    queryFn: () => api.announcements.list(q ? { q } : undefined),
  });

export const useMenuConfig = () =>
  useQuery({ queryKey: qk.menuConfig, queryFn: () => api.menu.config() });

export const useMenu = (from: string, to: string) =>
  useQuery({ queryKey: qk.menu(from, to), queryFn: () => api.menu.list(from, to) });

export const useNotifications = () =>
  useQuery({ queryKey: qk.notifications, queryFn: () => api.resident.notifications.list() });

export const usePaymentInfo = () =>
  useQuery({ queryKey: qk.paymentInfo, queryFn: () => api.resident.branding.paymentInfo() });

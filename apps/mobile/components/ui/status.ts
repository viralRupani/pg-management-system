import {
  ComplaintStatus,
  DepositStatus,
  DocumentStatus,
  InvoiceStatus,
  PaymentStatus,
} from '@pg/shared';

import type { BadgeVariant } from './badge';

interface StatusInfo {
  label: string;
  variant: BadgeVariant;
}

const FALLBACK: StatusInfo = { label: '—', variant: 'neutral' };

const INVOICE: Record<string, StatusInfo> = {
  [InvoiceStatus.PENDING]: { label: 'Pending', variant: 'amber' },
  [InvoiceStatus.PAID]: { label: 'Paid', variant: 'success' },
  [InvoiceStatus.OVERDUE]: { label: 'Overdue', variant: 'danger' },
  [InvoiceStatus.WAIVED]: { label: 'Waived', variant: 'neutral' },
};

const DOCUMENT: Record<string, StatusInfo> = {
  [DocumentStatus.PENDING]: { label: 'Pending', variant: 'amber' },
  [DocumentStatus.VERIFIED]: { label: 'Verified', variant: 'success' },
  [DocumentStatus.REJECTED]: { label: 'Rejected', variant: 'danger' },
};

const COMPLAINT: Record<string, StatusInfo> = {
  [ComplaintStatus.OPEN]: { label: 'Open', variant: 'amber' },
  [ComplaintStatus.IN_PROGRESS]: { label: 'In progress', variant: 'info' },
  [ComplaintStatus.RESOLVED]: { label: 'Resolved', variant: 'success' },
};

const DEPOSIT: Record<string, StatusInfo> = {
  [DepositStatus.HELD]: { label: 'Held', variant: 'info' },
  [DepositStatus.SETTLED]: { label: 'Settled', variant: 'success' },
};

const PAYMENT: Record<string, StatusInfo> = {
  [PaymentStatus.SUBMITTED]: { label: 'Under review', variant: 'info' },
  [PaymentStatus.APPROVED]: { label: 'Approved', variant: 'success' },
  [PaymentStatus.REJECTED]: { label: 'Rejected', variant: 'danger' },
};

/** Shown while a submitted payment awaits the manager's review. Not a stored
 * invoice status — derived from `InvoiceSummary.underReview` — so it takes
 * precedence over the PENDING/OVERDUE badge wherever it applies. */
const UNDER_REVIEW: StatusInfo = { label: 'Under review', variant: 'info' };

/** Badge for an invoice, honoring the derived "under review" flag first. */
export const invoiceBadge = (
  status: string,
  underReview: boolean,
): StatusInfo => (underReview ? UNDER_REVIEW : invoiceStatus(status));

export const invoiceStatus = (s: string): StatusInfo => INVOICE[s] ?? FALLBACK;
export const documentStatus = (s: string): StatusInfo => DOCUMENT[s] ?? FALLBACK;
export const complaintStatus = (s: string): StatusInfo =>
  COMPLAINT[s] ?? FALLBACK;
export const depositStatus = (s: string): StatusInfo => DEPOSIT[s] ?? FALLBACK;
export const paymentStatus = (s: string): StatusInfo => PAYMENT[s] ?? FALLBACK;

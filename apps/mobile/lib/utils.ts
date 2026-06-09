import { ApiError } from '@pg/api-client';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names, de-duplicating conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Surface an API error's message, falling back to a friendly default. */
export function toMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** Format integer paise as Indian rupees, e.g. 1234500 -> "₹12,345". */
export function formatPaise(paise: number | null | undefined): string {
  if (paise == null) return '—';
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  }).format(rupees);
}

/**
 * Zero-padded LOCAL date as `YYYY-MM-DD` for the API. NEVER `toISOString()` —
 * UTC is off-by-one in IST (the same landmine the web app hit). See root CLAUDE.md.
 */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

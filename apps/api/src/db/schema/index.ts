export * from "./tenants";
export * from "./owners";
export * from "./owner-tenants";
export * from "./auth-identities";
export * from "./users";
export * from "./buildings";
export * from "./floors";
export * from "./rooms";
export * from "./beds";
export * from "./allocations";
export * from "./transfer-requests";
export * from "./bookings";
export * from "./invoices";
export * from "./payments";
export * from "./rent-adjustments";
export * from "./extra-charges";
export * from "./invoice-charges";
export * from "./notifications";
export * from "./push-tokens";
export * from "./documents";
export * from "./deposits";
export * from "./deposit-transactions";
export * from "./complaints";
export * from "./complaint-updates";
export * from "./menu-items";
export * from "./announcements";
export * from "./announcement-recipients";
export * from "./budgets";
export * from "./expenses";
export * from "./billing-snapshots";
export * from "./short-stays";

import { tenants } from "./tenants";
import { owners } from "./owners";
import { ownerTenants } from "./owner-tenants";
import { authIdentities } from "./auth-identities";
import { users } from "./users";
import { buildings } from "./buildings";
import { floors } from "./floors";
import { rooms } from "./rooms";
import { beds } from "./beds";
import { allocations } from "./allocations";
import { transferRequests } from "./transfer-requests";
import { bookings } from "./bookings";
import { invoices } from "./invoices";
import { payments } from "./payments";
import { rentAdjustments } from "./rent-adjustments";
import { extraCharges } from "./extra-charges";
import { invoiceCharges } from "./invoice-charges";
import { notifications } from "./notifications";
import { pushTokens } from "./push-tokens";
import { documents } from "./documents";
import { deposits } from "./deposits";
import { depositTransactions } from "./deposit-transactions";
import { complaints } from "./complaints";
import { complaintUpdates } from "./complaint-updates";
import { menuConfig, menuSlots } from "./menu-items";
import { announcements } from "./announcements";
import { announcementRecipients } from "./announcement-recipients";
import { budgets } from "./budgets";
import { expenses } from "./expenses";
import { billingSnapshots } from "./billing-snapshots";
import { shortStays } from "./short-stays";

/** Full schema object passed to drizzle(). */
export const schema = {
  tenants,
  owners,
  ownerTenants,
  authIdentities,
  users,
  buildings,
  floors,
  rooms,
  beds,
  allocations,
  transferRequests,
  bookings,
  invoices,
  payments,
  rentAdjustments,
  extraCharges,
  invoiceCharges,
  notifications,
  pushTokens,
  documents,
  deposits,
  depositTransactions,
  complaints,
  complaintUpdates,
  menuConfig,
  menuSlots,
  announcements,
  announcementRecipients,
  budgets,
  expenses,
  billingSnapshots,
  shortStays,
};

/**
 * Tables that are tenant-scoped and therefore MUST have RLS enabled with both
 * USING and WITH CHECK policies. Kept here as a single source of truth so the
 * RLS migration and the isolation test can assert against the same list.
 * (`tenants` and `auth_identities` are intentionally excluded — see their docs.)
 */
export const RLS_TABLES = [
  "users",
  "buildings",
  "floors",
  "rooms",
  "beds",
  "allocations",
  "transfer_requests",
  "bookings",
  "invoices",
  "payments",
  "rent_adjustments",
  "extra_charges",
  "invoice_charges",
  "notifications",
  "push_tokens",
  "documents",
  "deposits",
  "deposit_transactions",
  "complaints",
  "complaint_updates",
  "menu_config",
  "menu_slots",
  "announcements",
  "announcement_recipients",
  "budgets",
  "expenses",
  "billing_snapshots",
  "short_stays",
] as const;

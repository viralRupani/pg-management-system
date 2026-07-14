/**
 * Shared enums — the single source of truth for roles and statuses across the
 * API, admin dashboard, and mobile app. Mirror these in the Drizzle schema.
 */

export const UserRole = {
  PLATFORM_ADMIN: "PLATFORM_ADMIN",
  // Owns one or more PGs; has every PG_MANAGER capability in each owned PG plus
  // manager management. A cross-tenant login identity (see owners table) that
  // also has a per-tenant PG_OWNER `users` row in each PG it owns.
  PG_OWNER: "PG_OWNER",
  PG_MANAGER: "PG_MANAGER",
  RESIDENT: "RESIDENT",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const TenantStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

export const ResidentStatus = {
  // Bed booked for a future move-in date but not yet moved in (no active
  // allocation, not billed/metered). Flips to ACTIVE when the booking activates.
  UPCOMING: "UPCOMING",
  ACTIVE: "ACTIVE",
  EXITED: "EXITED",
} as const;
export type ResidentStatus =
  (typeof ResidentStatus)[keyof typeof ResidentStatus];

export const OccupationType = {
  STUDENT: "STUDENT",
  PROFESSIONAL: "PROFESSIONAL",
  OTHER: "OTHER",
} as const;
export type OccupationType =
  (typeof OccupationType)[keyof typeof OccupationType];

/** Relation of a resident's emergency contact person to the resident. */
export const EmergencyRelation = {
  FATHER: "FATHER",
  MOTHER: "MOTHER",
  BROTHER: "BROTHER",
  SISTER: "SISTER",
  SPOUSE: "SPOUSE",
  GUARDIAN: "GUARDIAN",
  FRIEND: "FRIEND",
  OTHER: "OTHER",
} as const;
export type EmergencyRelation =
  (typeof EmergencyRelation)[keyof typeof EmergencyRelation];

export const BedStatus = {
  VACANT: "VACANT",
  OCCUPIED: "OCCUPIED",
  RESERVED: "RESERVED",
  // A RESERVED bed currently hosting a transient short-stay guest.
  // The underlying booking is still PENDING; the bed reverts to RESERVED on checkout.
  TRANSIENT: "TRANSIENT",
} as const;
export type BedStatus = (typeof BedStatus)[keyof typeof BedStatus];

export const ShortStayStatus = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type ShortStayStatus =
  (typeof ShortStayStatus)[keyof typeof ShortStayStatus];

export const InvoiceStatus = {
  PENDING: "PENDING",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
  WAIVED: "WAIVED",
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const PaymentStatus = {
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/** How the resident paid. UPI carries proof (screenshot/UTR); CASH is paid in
 * person and the manager confirms it on review. */
export const PaymentMethod = {
  UPI: "UPI",
  CASH: "CASH",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/**
 * A room-transfer request: a manager records the intent to move a resident to a
 * target bed by a planned date (advisory — the bed is NOT hard-locked). PENDING
 * until the manager executes the move on the actual day (-> COMPLETED) or drops
 * it (-> CANCELLED).
 */
export const TransferRequestStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type TransferRequestStatus =
  (typeof TransferRequestStatus)[keyof typeof TransferRequestStatus];

/**
 * A future-dated bed booking: a manager holds a bed (and takes the deposit) for
 * an incoming resident before their move-in date. PENDING until a daily job
 * activates it on the move-in date (-> ACTIVATED, a real allocation is created)
 * or the manager drops it (-> CANCELLED).
 */
export const BookingStatus = {
  PENDING: "PENDING",
  ACTIVATED: "ACTIVATED",
  CANCELLED: "CANCELLED",
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const ComplaintStatus = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
} as const;
export type ComplaintStatus =
  (typeof ComplaintStatus)[keyof typeof ComplaintStatus];

export const DocumentType = {
  AADHAAR: "AADHAAR",
  PAN: "PAN",
  PHOTO: "PHOTO",
  RENTAL_AGREEMENT: "RENTAL_AGREEMENT",
  OTHER: "OTHER",
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const DocumentStatus = {
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const;
export type DocumentStatus =
  (typeof DocumentStatus)[keyof typeof DocumentStatus];

/**
 * Derived KYC rollup for a resident — NOT stored, computed from the resident's
 * required documents (currently Aadhaar only). NOT_SUBMITTED = no document yet;
 * PENDING/VERIFIED/REJECTED mirror the document's own review state.
 */
export const KycStatus = {
  NOT_SUBMITTED: "NOT_SUBMITTED",
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export const DepositStatus = {
  HELD: "HELD",
  SETTLED: "SETTLED",
} as const;
export type DepositStatus = (typeof DepositStatus)[keyof typeof DepositStatus];

export const DepositTxnType = {
  COLLECTION: "COLLECTION",
  DEDUCTION: "DEDUCTION",
  REFUND: "REFUND",
} as const;
export type DepositTxnType =
  (typeof DepositTxnType)[keyof typeof DepositTxnType];

/**
 * A resident-initiated action on their move-out request, awaiting a manager
 * decision. REQUEST = a brand-new move-out ask; UPDATE = change the approved
 * move-out month; CANCEL = withdraw the approved move-out entirely.
 */
export const ExitPendingType = {
  REQUEST: "REQUEST",
  UPDATE: "UPDATE",
  CANCEL: "CANCEL",
} as const;
export type ExitPendingType =
  (typeof ExitPendingType)[keyof typeof ExitPendingType];

export const ComplaintCategory = {
  MAINTENANCE: "MAINTENANCE",
  CLEANLINESS: "CLEANLINESS",
  FOOD: "FOOD",
  WIFI: "WIFI",
  SECURITY: "SECURITY",
  OTHER: "OTHER",
} as const;
export type ComplaintCategory =
  (typeof ComplaintCategory)[keyof typeof ComplaintCategory];

/**
 * An extra charge's billing cadence. ONE_TIME is folded into a single invoice
 * once; MONTHLY is re-applied to every monthly invoice while the charge is active.
 */
export const ChargeFrequency = {
  ONE_TIME: "ONE_TIME",
  MONTHLY: "MONTHLY",
} as const;
export type ChargeFrequency =
  (typeof ChargeFrequency)[keyof typeof ChargeFrequency];

export const MealType = {
  BREAKFAST: "BREAKFAST",
  LUNCH: "LUNCH",
  DINNER: "DINNER",
  SNACKS: "SNACKS",
} as const;
export type MealType = (typeof MealType)[keyof typeof MealType];

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

export const BedStatus = {
  VACANT: "VACANT",
  OCCUPIED: "OCCUPIED",
  RESERVED: "RESERVED",
} as const;
export type BedStatus = (typeof BedStatus)[keyof typeof BedStatus];

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

export const DepositStatus = {
  HELD: "HELD",
  SETTLED: "SETTLED",
} as const;
export type DepositStatus = (typeof DepositStatus)[keyof typeof DepositStatus];

export const DepositTxnType = {
  DEDUCTION: "DEDUCTION",
  REFUND: "REFUND",
} as const;
export type DepositTxnType =
  (typeof DepositTxnType)[keyof typeof DepositTxnType];

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

export const MealType = {
  BREAKFAST: "BREAKFAST",
  LUNCH: "LUNCH",
  DINNER: "DINNER",
  SNACKS: "SNACKS",
} as const;
export type MealType = (typeof MealType)[keyof typeof MealType];

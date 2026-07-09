import { z } from "zod";
import {
  EmergencyRelation,
  KycStatus,
  OccupationType,
  ResidentStatus,
} from "../enums";
import { indianPhone } from "./phone";

/**
 * Manager registers a new resident in their PG. The emergency contact is
 * optional as a whole, but all-or-nothing: if any of name/relation/phone is
 * given, all three are required (a half-filled contact is useless).
 */
export const registerResidentSchema = z
  .object({
    name: z.string().min(2).max(120),
    phone: indianPhone,
    email: z.string().email().optional(),
    // Required for long-term residents; optional for short-stay guests (a
    // lightweight guest record only needs name + phone). See superRefine.
    age: z.number().int().min(15).max(120).optional(),
    occupationType: z.nativeEnum(OccupationType).default(OccupationType.OTHER),
    nativePlace: z.string().max(120).optional(),
    emergencyContactName: z.string().min(2).max(120).optional(),
    emergencyContactRelation: z.nativeEnum(EmergencyRelation).optional(),
    emergencyContactPhone: indianPhone.optional(),
    joinDate: z.string().date().optional(), // ISO date; defaults to today server-side
    // Planned move-in (long-term) / check-in (short stay) date, captured at
    // registration so the bed-assign dialog can pre-fill and filter beds. The
    // assign step turns a future date into a booking, a today/past date into a
    // live allocation.
    expectedMoveInDate: z.string().date().optional(),
    // Short-stay guest: a transient occupant who pays a per-day charge upfront
    // and is never invoiced or metered (kept out of `allocations`). When true,
    // checkOut + per-day charge are required.
    isShortStay: z.boolean().default(false),
    shortStayCheckOutDate: z.string().date().optional(),
    shortStayPerDayChargePaise: z.number().int().min(0).optional(),
    // Refer & earn: the resident (must already exist in this PG) who referred
    // this one. Only meaningful for long-term residents — a short-stay guest
    // never gets an `allocations` row, so a referral tied to one could never
    // qualify for a discount.
    referredByUserId: z.string().uuid().optional(),
  })
  .superRefine((d, ctx) => {
    const fields = [
      ["emergencyContactName", d.emergencyContactName],
      ["emergencyContactRelation", d.emergencyContactRelation],
      ["emergencyContactPhone", d.emergencyContactPhone],
    ] as const;
    const filled = fields.filter(([, v]) => v != null);
    if (filled.length > 0 && filled.length < fields.length) {
      for (const [path, v] of fields) {
        if (v == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path],
            message:
              "Emergency contact name, relation, and phone are all required together",
          });
        }
      }
    }

    if (d.isShortStay) {
      // A short stay needs check-in (move-in), check-out, and a per-day charge.
      if (!d.expectedMoveInDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expectedMoveInDate"],
          message: "Check-in date is required for a short stay",
        });
      }
      if (!d.shortStayCheckOutDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shortStayCheckOutDate"],
          message: "Check-out date is required for a short stay",
        });
      }
      if (
        d.expectedMoveInDate &&
        d.shortStayCheckOutDate &&
        d.shortStayCheckOutDate <= d.expectedMoveInDate
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shortStayCheckOutDate"],
          message: "Check-out date must be after the check-in date",
        });
      }
      if (d.shortStayPerDayChargePaise == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shortStayPerDayChargePaise"],
          message: "Per-day charge is required for a short stay",
        });
      }
      if (d.referredByUserId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["referredByUserId"],
          message: "A short-stay guest can't be recorded as a referral",
        });
      }
    } else if (d.age == null) {
      // Long-term residents must give an age (DB CHECK enforces it too).
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["age"],
        message: "Age is required",
      });
    }
  });
export type RegisterResidentInput = z.infer<typeof registerResidentSchema>;

export const residentSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string(),
  age: z.number().int().nullable(),
  occupationType: z.nativeEnum(OccupationType),
  nativePlace: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactRelation: z.nativeEnum(EmergencyRelation).nullable(),
  emergencyContactPhone: z.string().nullable(),
  status: z.nativeEnum(ResidentStatus),
  bedLabel: z.string().nullable(),
  roomCapacity: z.number().int().nullable(),
  // The current bed's id + full location path (building → floor → room), so the
  // detail page can show "Block A · Ground · 101 · Bed A" and deep-link straight
  // to that bed on the property page. All null when unallocated.
  bedId: z.string().uuid().nullable(),
  roomLabel: z.string().nullable(),
  floorLabel: z.string().nullable(),
  buildingName: z.string().nullable(),
  // The current room's monthly rent (what invoicing actually bills) — null
  // when unallocated. Live, not a snapshot: reflects room-rent edits instantly.
  currentRentPaise: z.number().int().nullable(),
  kycStatus: z.nativeEnum(KycStatus),
  // For an UPCOMING resident the bed is held via a PENDING booking (no live
  // allocation yet), so `bedLabel` is null. These surface that held bed +
  // move-in date so the roster shows "B-12 · moves in …" instead of "No bed".
  bookedBedLabel: z.string().nullable(),
  // The held bed's id (jump-to-bed deep-link for an UPCOMING resident).
  bookedBedId: z.string().uuid().nullable(),
  moveInDate: z.string().nullable(), // ISO; set only while UPCOMING
  // Set (YYYY-MM-DD) when the resident has raised a pending move-out request,
  // null otherwise — lets the roster tag "Exit requested" without a drill-down.
  exitRequestedDate: z.string().nullable(),
  // Planned move-in / check-in captured at registration (before a bed is
  // assigned). YYYY-MM-DD, null once not relevant.
  expectedMoveInDate: z.string().nullable(),
  // Short-stay guest marker + terms. A short-stay guest is rent- and
  // metering-exempt and pays `shortStayTotalPaise` (days × per-day) upfront.
  isShortStay: z.boolean(),
  shortStayCheckOutDate: z.string().nullable(), // YYYY-MM-DD
  shortStayPerDayChargePaise: z.number().int().nullable(),
  // Computed days × per-day for display; null for non-short-stay residents or
  // when the dates/charge aren't both set.
  shortStayTotalPaise: z.number().int().nullable(),
  // Registration provenance: who added this resident and when. `createdByName`
  // is the manager/owner who registered them (null for seeded/legacy rows);
  // `createdAt` is the registration timestamp (ISO) — distinct from joinDate.
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  // Refer & earn: the resident who referred this one (set once at
  // registration), null if none was recorded.
  referredByName: z.string().nullable(),
});
export type ResidentSummary = z.infer<typeof residentSummarySchema>;

/** Query params for the manager's resident list — search + status filter + pagination. */
export const residentListQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  // "CURRENT" = ACTIVE or UPCOMING (the PG's current roster — booked residents
  // shown alongside live ones). Strict single-status values still work; the
  // bookings picker relies on "ACTIVE" excluding UPCOMING.
  status: z
    .union([
      z.nativeEnum(ResidentStatus),
      z.literal("ALL"),
      z.literal("CURRENT"),
    ])
    .default(ResidentStatus.ACTIVE),
  // KYC rollup filter: PENDING = anything not VERIFIED (not submitted, awaiting
  // review, or rejected — i.e. KYC still needs chasing); VERIFIED = Aadhaar done.
  kyc: z
    .union([z.literal("ALL"), z.literal("PENDING"), z.literal("VERIFIED")])
    .default("ALL"),
  // When true, narrow to residents with a pending move-out request.
  exitRequested: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ResidentListQuery = z.infer<typeof residentListQuerySchema>;

export const residentListResultSchema = z.object({
  items: z.array(residentSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});
export type ResidentListResult = z.infer<typeof residentListResultSchema>;

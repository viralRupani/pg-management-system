import { z } from "zod";
import { MealType, OccupationType } from "../enums";

// --- Menu ---
const dateString = z.string().date(); // 'YYYY-MM-DD'

/** Materialized menu row returned by GET /menu?from=&to= (resident-compatible). */
export const menuItemSummarySchema = z.object({
  id: z.string().uuid(),
  menuDate: z.string(),
  mealType: z.nativeEnum(MealType),
  items: z.string(),
});
export type MenuItemSummary = z.infer<typeof menuItemSummarySchema>;

/** Tenant cycle config: how many weeks repeat + which Monday anchors the cycle. */
export const menuConfigSchema = z.object({
  cycleLengthWeeks: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  cycleStartDate: dateString,
});
export type MenuConfig = z.infer<typeof menuConfigSchema>;

/** One abstract template slot. */
export const menuSlotSummarySchema = z.object({
  id: z.string().uuid(),
  weekNumber: z.number().int().min(1).max(3),
  dayOfWeek: z.number().int().min(1).max(7),
  mealType: z.nativeEnum(MealType),
  items: z.string(),
});
export type MenuSlotSummary = z.infer<typeof menuSlotSummarySchema>;

/** Manager upserts one template slot. */
export const upsertMenuSlotSchema = z.object({
  weekNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  dayOfWeek: z.number().int().min(1).max(7),
  mealType: z.nativeEnum(MealType),
  items: z.string().min(1).max(1000),
});
export type UpsertMenuSlotInput = z.infer<typeof upsertMenuSlotSchema>;

/** Manager updates cycle config. */
export const updateMenuConfigSchema = z.object({
  cycleLengthWeeks: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  cycleStartDate: dateString,
});
export type UpdateMenuConfigInput = z.infer<typeof updateMenuConfigSchema>;

// --- Announcements ---
/**
 * Who an announcement is for, resolved to a concrete resident set at post time.
 * ALL = the whole PG (default, tenant-shared). SPECIFIC = a hand-picked set.
 * SEGMENT = an attribute filter (occupation and/or building) over active
 * residents.
 */
export const announcementAudienceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ALL") }),
  z.object({
    type: z.literal("SPECIFIC"),
    residentIds: z.array(z.string().uuid()).min(1).max(500),
  }),
  z.object({
    type: z.literal("SEGMENT"),
    occupationType: z.nativeEnum(OccupationType).optional(),
    buildingId: z.string().uuid().optional(),
  }),
]);
export type AnnouncementAudience = z.infer<typeof announcementAudienceSchema>;

export const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(4000),
  audience: announcementAudienceSchema.default({ type: "ALL" }),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const announcementSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  audienceType: z.string(),
  audienceLabel: z.string().nullable(), // null for residents + legacy ALL posts
  createdAt: z.string(),
});
export type AnnouncementSummary = z.infer<typeof announcementSummarySchema>;

// --- Budgets & expenses ---
const periodString = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Period must be 'YYYY-MM'");

/** Manager sets (upserts) a category budget for a month. */
export const setBudgetSchema = z.object({
  category: z.string().min(1).max(60),
  period: periodString,
  limitPaise: z.number().int().min(0),
});
export type SetBudgetInput = z.infer<typeof setBudgetSchema>;

/** Manager records an expense. */
export const recordExpenseSchema = z.object({
  category: z.string().min(1).max(60),
  amountPaise: z.number().int().positive(),
  note: z.string().max(300).optional(),
  spentOn: dateString,
});
export type RecordExpenseInput = z.infer<typeof recordExpenseSchema>;

export const expenseSummarySchema = z.object({
  id: z.string().uuid(),
  category: z.string(),
  amountPaise: z.number().int(),
  note: z.string().nullable(),
  spentOn: z.string(),
});
export type ExpenseSummary = z.infer<typeof expenseSummarySchema>;

/** One row of the spend-vs-budget summary for a period. */
export const budgetSummaryRowSchema = z.object({
  category: z.string(),
  limitPaise: z.number().int().nullable(), // null = no budget set
  spentPaise: z.number().int(),
});
export type BudgetSummaryRow = z.infer<typeof budgetSummaryRowSchema>;

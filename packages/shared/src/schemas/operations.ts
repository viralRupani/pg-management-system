import { z } from "zod";
import { MealType } from "../enums";

// --- Menu ---
const dateString = z.string().date(); // 'YYYY-MM-DD'

/** Manager publishes (upserts) the menu for a date + meal. */
export const upsertMenuSchema = z.object({
  menuDate: dateString,
  mealType: z.nativeEnum(MealType),
  items: z.string().min(1).max(1000),
});
export type UpsertMenuInput = z.infer<typeof upsertMenuSchema>;

export const menuItemSummarySchema = z.object({
  id: z.string().uuid(),
  menuDate: z.string(),
  mealType: z.nativeEnum(MealType),
  items: z.string(),
});
export type MenuItemSummary = z.infer<typeof menuItemSummarySchema>;

// --- Announcements ---
export const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(4000),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const announcementSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
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

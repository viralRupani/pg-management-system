import { z } from "zod";
import { DepositStatus, DepositTxnType } from "../enums";

/** Manager records a resident's security deposit (one per resident). */
export const recordDepositSchema = z.object({
  residentId: z.string().uuid(),
  amountPaise: z.number().int().min(0),
});
export type RecordDepositInput = z.infer<typeof recordDepositSchema>;

/**
 * Manager adjusts a resident's held deposit amount (e.g. on a room transfer to a
 * pricier room, top it up so it still covers a month's rent). Creates the deposit
 * if none exists yet. Never below what's already been deducted.
 */
export const updateDepositAmountSchema = z.object({
  residentId: z.string().uuid(),
  amountPaise: z.number().int().min(0),
});
export type UpdateDepositAmountInput = z.infer<
  typeof updateDepositAmountSchema
>;

/** Manager collects a deposit payment (creates the deposit if none exists yet,
 * otherwise adds to it — supports partial/installment collection). */
export const collectDepositSchema = z.object({
  residentId: z.string().uuid(),
  amountPaise: z.number().int().positive(),
});
export type CollectDepositInput = z.infer<typeof collectDepositSchema>;

/** Manager refunds part of a resident's held deposit any time (not just at
 * exit) — e.g. a room downgrade lowers the required deposit. */
export const refundDepositSchema = z.object({
  residentId: z.string().uuid(),
  amountPaise: z.number().int().positive(),
  reason: z.string().min(1).max(200),
});
export type RefundDepositInput = z.infer<typeof refundDepositSchema>;

/** One deduction line-item in an exit settlement. */
export const deductionSchema = z.object({
  reason: z.string().min(1).max(200),
  amountPaise: z.number().int().positive(),
});
export type DeductionInput = z.infer<typeof deductionSchema>;

/** Manager settles a resident's exit: deductions + refund, frees the bed. */
export const exitSettlementSchema = z.object({
  residentId: z.string().uuid(),
  deductions: z.array(deductionSchema).default([]),
});
export type ExitSettlementInput = z.infer<typeof exitSettlementSchema>;

/** Manager applies the held deposit to a rent invoice ("use my deposit for rent"). */
export const applyDepositToInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
});
export type ApplyDepositToInvoiceInput = z.infer<
  typeof applyDepositToInvoiceSchema
>;

/** Result of settling a rent invoice from the deposit. */
export const applyDepositToInvoiceResultSchema = z.object({
  invoiceId: z.string().uuid(),
  period: z.string(),
  amountPaise: z.number().int(),
  depositBalancePaise: z.number().int(), // remaining held balance after this
});
export type ApplyDepositToInvoiceResult = z.infer<
  typeof applyDepositToInvoiceResultSchema
>;

/** Resident requests their own move-out: a preferred date + optional note. */
export const exitRequestSchema = z.object({
  requestedDate: z.string().date(), // 'YYYY-MM-DD'
  note: z.string().max(500).optional(),
});
export type ExitRequestInput = z.infer<typeof exitRequestSchema>;

/** A resident's pending move-out request (null when none has been raised). */
export const exitRequestSummarySchema = z.object({
  requestedDate: z.string(),
  note: z.string().nullable(),
  requestedAt: z.string(),
});
export type ExitRequestSummary = z.infer<typeof exitRequestSummarySchema>;

export const depositSummarySchema = z.object({
  id: z.string().uuid(),
  residentId: z.string().uuid(),
  residentName: z.string(),
  amountPaise: z.number().int(),
  status: z.nativeEnum(DepositStatus),
});
export type DepositSummary = z.infer<typeof depositSummarySchema>;

export const depositTransactionSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(DepositTxnType),
  reason: z.string().nullable(),
  amountPaise: z.number().int(),
  // Set when this deduction settled a rent invoice (with that invoice's period).
  invoiceId: z.string().uuid().nullable(),
  period: z.string().nullable(),
  createdAt: z.string(),
});
export type DepositTransactionSummary = z.infer<
  typeof depositTransactionSchema
>;

/** The computed result of an exit settlement. */
export const settlementResultSchema = z.object({
  depositPaise: z.number().int(), // original held amount
  priorDeductionsPaise: z.number().int(), // deductions already applied pre-exit
  availablePaise: z.number().int(), // held − prior deductions (cap for exit deductions)
  totalDeductionsPaise: z.number().int(), // deductions recorded at this exit
  refundPaise: z.number().int(),
  exited: z.boolean(),
  bedFreed: z.boolean(),
});
export type SettlementResult = z.infer<typeof settlementResultSchema>;

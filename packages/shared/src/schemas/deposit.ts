import { z } from "zod";
import { DepositStatus, DepositTxnType } from "../enums";

/** Manager records a resident's security deposit (one per resident). */
export const recordDepositSchema = z.object({
  residentId: z.string().uuid(),
  amountPaise: z.number().int().min(0),
});
export type RecordDepositInput = z.infer<typeof recordDepositSchema>;

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
  createdAt: z.string(),
});
export type DepositTransactionSummary = z.infer<
  typeof depositTransactionSchema
>;

/** The computed result of an exit settlement. */
export const settlementResultSchema = z.object({
  depositPaise: z.number().int(),
  totalDeductionsPaise: z.number().int(),
  refundPaise: z.number().int(),
  exited: z.boolean(),
  bedFreed: z.boolean(),
});
export type SettlementResult = z.infer<typeof settlementResultSchema>;

import { z } from "zod";
import { InvoiceStatus, PaymentStatus } from "../enums";
import { contentTypeField } from "./upload";

/** Billing period as 'YYYY-MM' (project-wide convention). */
export const periodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Period must be 'YYYY-MM'");

/** Manager triggers monthly invoice generation for active residents. */
export const generateInvoicesSchema = z.object({
  period: periodSchema.optional(), // defaults to current month server-side
  dueDate: z.string().date().optional(), // defaults to the 10th of the period
});
export type GenerateInvoicesInput = z.infer<typeof generateInvoicesSchema>;

export const invoiceSummarySchema = z.object({
  id: z.string().uuid(),
  residentId: z.string().uuid(),
  residentName: z.string(),
  period: z.string(),
  amountPaise: z.number().int(),
  dueDate: z.string(),
  status: z.nativeEnum(InvoiceStatus),
});
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;

/** Resident asks for a presigned URL to upload a payment screenshot. */
export const paymentUploadUrlSchema = z.object({
  invoiceId: z.string().uuid(),
  contentType: contentTypeField,
});
export type PaymentUploadUrlInput = z.infer<typeof paymentUploadUrlSchema>;

/**
 * Resident submits a payment against an invoice. Proof is a screenshot (S3 key)
 * and/or a UPI reference number (UTR) — at least one is required, because some
 * UPI apps (GPay et al.) block screenshots of the success screen.
 */
export const submitPaymentSchema = z
  .object({
    invoiceId: z.string().uuid(),
    screenshotKey: z.string().min(1).optional(),
    referenceId: z.string().trim().min(6).max(40).optional(),
    amountPaise: z.number().int().positive().optional(), // defaults to invoice amount
  })
  .refine((d) => Boolean(d.screenshotKey) || Boolean(d.referenceId), {
    message: "Provide a payment screenshot or a UPI reference number",
    path: ["referenceId"],
  });
export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>;

/** Manager rejects a payment with a reason. */
export const rejectPaymentSchema = z.object({
  note: z.string().min(1).max(500),
});
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;

export const paymentSummarySchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  residentId: z.string().uuid(),
  residentName: z.string(),
  period: z.string(),
  amountPaise: z.number().int(),
  status: z.nativeEnum(PaymentStatus),
  reviewNote: z.string().nullable(),
  referenceId: z.string().nullable(), // UPI reference (UTR), if the resident gave one
  hasScreenshot: z.boolean(), // whether a screenshot is attached (drives the View button)
  createdAt: z.string(),
});
export type PaymentSummary = z.infer<typeof paymentSummarySchema>;

/** Manager edits a room's rent (deferred from M2; feeds invoice generation). */
export const updateRoomRentSchema = z.object({
  monthlyRentPaise: z.number().int().min(0),
});
export type UpdateRoomRentInput = z.infer<typeof updateRoomRentSchema>;

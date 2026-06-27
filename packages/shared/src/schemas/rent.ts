import { z } from "zod";
import { InvoiceStatus, PaymentMethod, PaymentStatus } from "../enums";
import { contentTypeField } from "./upload";

/** Billing period as 'YYYY-MM' (project-wide convention). */
export const periodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Period must be 'YYYY-MM'");

/** Manager triggers monthly invoice generation for active residents. */
export const generateInvoicesSchema = z.object({
  period: periodSchema.optional(), // defaults to current month server-side
  dueDate: z.string().date().optional(), // defaults to the 10th of the period
  // Optional subset to bill. Omitted OR empty = all active residents (the
  // default monthly behavior); a non-empty list scopes generation to exactly
  // those residents (e.g. billing a single mid-month joiner).
  residentIds: z.array(z.string().uuid()).optional(),
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
  // Soft-delete (void): non-null when the invoice has been cancelled by a
  // manager; `deletedReason` is the required note shown over the invoice.
  deletedAt: z.string().nullable(),
  deletedReason: z.string().nullable(),
});
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;

/** Manager voids (soft-deletes) an invoice — a reason is mandatory. */
export const deleteInvoiceSchema = z.object({
  reason: z.string().trim().min(1).max(300),
});
export type DeleteInvoiceInput = z.infer<typeof deleteInvoiceSchema>;

/** Query params for the manager's invoice list — search + offset pagination. */
export const invoiceListQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(), // resident name or period
  residentId: z.string().uuid().optional(), // scope to one resident's invoices
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const invoiceListResultSchema = z.object({
  items: z.array(invoiceSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});
export type InvoiceListResult = z.infer<typeof invoiceListResultSchema>;

/**
 * Per-PG schedule for automatic monthly invoice generation. Day-of-month +
 * time of day are interpreted in IST (the product's business calendar). Used
 * for both create and edit (the endpoint upserts the single per-tenant row).
 * Day is capped at 28 to avoid short-month ambiguity (matches the project's
 * day-granular IST conventions). Delete removes the row → manual-only.
 */
export const invoiceScheduleInputSchema = z.object({
  dayOfMonth: z.number().int().min(1).max(28),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});
export type InvoiceScheduleInput = z.infer<typeof invoiceScheduleInputSchema>;

/** The stored schedule as returned to the manager UI (null when none set). */
export const invoiceScheduleSchema = z.object({
  dayOfMonth: z.number().int(),
  hour: z.number().int(),
  minute: z.number().int(),
  // Last billing period ('YYYY-MM') the scheduled run generated for — drives
  // the "last generated" display and the once-per-period dispatch guard.
  lastRunPeriod: z.string().nullable(),
  updatedAt: z.string(),
});
export type InvoiceSchedule = z.infer<typeof invoiceScheduleSchema>;

/** Resident asks for a presigned URL to upload a payment screenshot. */
export const paymentUploadUrlSchema = z.object({
  invoiceId: z.string().uuid(),
  contentType: contentTypeField,
});
export type PaymentUploadUrlInput = z.infer<typeof paymentUploadUrlSchema>;

/**
 * Resident submits a payment against an invoice. For UPI, proof is a screenshot
 * (S3 key) and/or a UPI reference number (UTR) — at least one is required,
 * because some UPI apps (GPay et al.) block screenshots of the success screen.
 * For CASH (paid in person), no online proof is required; the manager confirms
 * receipt on review.
 */
export const submitPaymentSchema = z
  .object({
    invoiceId: z.string().uuid(),
    method: z.nativeEnum(PaymentMethod).default(PaymentMethod.UPI),
    screenshotKey: z.string().min(1).optional(),
    referenceId: z.string().trim().min(6).max(40).optional(),
    amountPaise: z.number().int().positive().optional(), // defaults to invoice amount
  })
  .refine(
    (d) =>
      d.method === PaymentMethod.CASH ||
      Boolean(d.screenshotKey) ||
      Boolean(d.referenceId),
    {
      message: "Provide a payment screenshot or a UPI reference number",
      path: ["referenceId"],
    },
  );
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
  method: z.nativeEnum(PaymentMethod), // UPI (proof) or CASH (paid in person)
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

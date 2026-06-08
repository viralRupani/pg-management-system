import { z } from "zod";
import { ComplaintCategory, ComplaintStatus } from "../enums";

/** Resident files a complaint (photo optional, uploaded via presigned URL). */
export const fileComplaintSchema = z.object({
  category: z.nativeEnum(ComplaintCategory),
  description: z.string().min(3).max(2000),
  photoKey: z.string().min(1).optional(),
});
export type FileComplaintInput = z.infer<typeof fileComplaintSchema>;

/** A note added to a complaint thread (resident or manager). */
export const complaintUpdateSchema = z.object({
  note: z.string().min(1).max(2000),
});
export type ComplaintUpdateInput = z.infer<typeof complaintUpdateSchema>;

/** Manager changes a complaint's status (and optionally self-assigns). */
export const updateComplaintStatusSchema = z.object({
  status: z.nativeEnum(ComplaintStatus),
  assignToSelf: z.boolean().optional(),
});
export type UpdateComplaintStatusInput = z.infer<
  typeof updateComplaintStatusSchema
>;

export const complaintSummarySchema = z.object({
  id: z.string().uuid(),
  residentId: z.string().uuid(),
  residentName: z.string(),
  category: z.nativeEnum(ComplaintCategory),
  description: z.string(),
  status: z.nativeEnum(ComplaintStatus),
  assignedToUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type ComplaintSummary = z.infer<typeof complaintSummarySchema>;

export const complaintUpdateEntrySchema = z.object({
  id: z.string().uuid(),
  authorUserId: z.string().uuid(),
  note: z.string(),
  createdAt: z.string(),
});
export type ComplaintUpdateEntry = z.infer<typeof complaintUpdateEntrySchema>;

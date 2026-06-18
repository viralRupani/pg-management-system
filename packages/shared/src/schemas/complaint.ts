import { z } from "zod";
import { ComplaintCategory, ComplaintStatus } from "../enums";
import { contentTypeField } from "./upload";

export const complaintListQuerySchema = z.object({
  status: z
    .union([z.nativeEnum(ComplaintStatus), z.literal("ALL")])
    .default("ALL"),
  residentId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export type ComplaintListQuery = z.infer<typeof complaintListQuerySchema>;

/** Resident asks for a presigned URL to upload a complaint photo. */
export const complaintPhotoUrlSchema = z.object({
  contentType: contentTypeField,
});
export type ComplaintPhotoUrlInput = z.infer<typeof complaintPhotoUrlSchema>;

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
  photoKey: z.string().nullable(),
  createdAt: z.string(),
});
export type ComplaintSummary = z.infer<typeof complaintSummarySchema>;

export const complaintListResultSchema = z.object({
  items: z.array(complaintSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});
export type ComplaintListResult = z.infer<typeof complaintListResultSchema>;

export const complaintUpdateEntrySchema = z.object({
  id: z.string().uuid(),
  authorUserId: z.string().uuid(),
  note: z.string(),
  createdAt: z.string(),
});
export type ComplaintUpdateEntry = z.infer<typeof complaintUpdateEntrySchema>;

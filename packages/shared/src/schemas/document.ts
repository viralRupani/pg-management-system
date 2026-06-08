import { z } from "zod";
import { DocumentStatus, DocumentType } from "../enums";

/** Resident asks for a presigned URL to upload a KYC document. */
export const documentUploadUrlSchema = z.object({
  type: z.nativeEnum(DocumentType),
});
export type DocumentUploadUrlInput = z.infer<typeof documentUploadUrlSchema>;

/** Resident submits an uploaded document for verification. */
export const submitDocumentSchema = z.object({
  type: z.nativeEnum(DocumentType),
  s3Key: z.string().min(1),
});
export type SubmitDocumentInput = z.infer<typeof submitDocumentSchema>;

/** Manager rejects a document with a reason. */
export const rejectDocumentSchema = z.object({
  note: z.string().min(1).max(500),
});
export type RejectDocumentInput = z.infer<typeof rejectDocumentSchema>;

export const documentSummarySchema = z.object({
  id: z.string().uuid(),
  residentId: z.string().uuid(),
  residentName: z.string(),
  type: z.nativeEnum(DocumentType),
  status: z.nativeEnum(DocumentStatus),
  reviewNote: z.string().nullable(),
  createdAt: z.string(),
});
export type DocumentSummary = z.infer<typeof documentSummarySchema>;

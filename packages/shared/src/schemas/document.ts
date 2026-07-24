import { z } from "zod";
import { DocumentStatus, DocumentType } from "../enums";
import { contentTypeField } from "./upload";

/** Resident asks for a presigned URL to upload a KYC document. */
export const documentUploadUrlSchema = z.object({
  type: z.nativeEnum(DocumentType),
  contentType: contentTypeField,
});
export type DocumentUploadUrlInput = z.infer<typeof documentUploadUrlSchema>;

/** Resident submits an uploaded document for verification. */
export const submitDocumentSchema = z.object({
  type: z.nativeEnum(DocumentType),
  s3Key: z.string().min(1),
  // The uploaded file's MIME type, so the manager viewer can pick image vs PDF
  // rendering without a HEAD round-trip. The resident already computes it for
  // the presign; optional for back-compat with pre-existing rows.
  contentType: contentTypeField.optional(),
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
  // MIME type of the stored file (null for pre-existing rows). Drives the admin
  // viewer's PDF-vs-image branch.
  contentType: z.string().nullable(),
  createdAt: z.string(),
});
export type DocumentSummary = z.infer<typeof documentSummarySchema>;

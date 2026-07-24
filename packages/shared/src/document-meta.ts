import { DocumentType } from "./enums";

/**
 * KYC document presentation + policy — the single source of truth shared by the
 * resident web app, the resident mobile app, and the manager admin dashboard.
 * Residents pick a type from this fixed, legally-compliant list (no free-form
 * "other" upload); each type carries the instruction text shown at upload time.
 */
export const DOCUMENT_TYPE_META: Record<
  DocumentType,
  { label: string; instruction: string }
> = {
  [DocumentType.MASKED_AADHAAR]: {
    label: "Masked Aadhaar",
    instruction:
      "Upload masked Aadhaar only (first 8 digits hidden as XXXX-XXXX). Download it free: myAadhaar → Download Aadhaar → select 'Masked Aadhaar'. Also available in DigiLocker.",
  },
  [DocumentType.DRIVING_LICENCE]: {
    label: "Driving Licence",
    instruction: "Upload both sides of the card, or the DigiLocker version.",
  },
  [DocumentType.VOTER_ID]: {
    label: "Voter ID",
    instruction: "Upload both sides.",
  },
  [DocumentType.PASSPORT]: {
    label: "Passport",
    instruction: "Upload the first page (photo) and last page (address).",
  },
  [DocumentType.PHOTO]: {
    label: "Resident photograph",
    instruction: "Clear, recent photo of your face, plain background.",
  },
};

/** Global privacy notice shown on every KYC upload surface. */
export const DOCUMENT_UPLOAD_WARNING =
  "Upload only the document type you selected. Your documents are encrypted, visible only to your PG manager, and deleted after you exit the PG.";

/**
 * The government-photo-ID document types. KYC is "complete" for a resident when
 * ANY ONE of these is verified (the photograph is not a government ID and does
 * not count). Drives the server-side KYC rollup + the manager "KYC to verify"
 * alert.
 */
export const GOVERNMENT_ID_TYPES: DocumentType[] = [
  DocumentType.MASKED_AADHAAR,
  DocumentType.DRIVING_LICENCE,
  DocumentType.VOTER_ID,
  DocumentType.PASSPORT,
];

/** Human label for a document type, falling back to the raw value (legacy rows). */
export function documentTypeLabel(type: string): string {
  return (DOCUMENT_TYPE_META as Record<string, { label: string }>)[type]?.label ?? type;
}

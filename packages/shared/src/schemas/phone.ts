import { z } from "zod";

/**
 * Indian mobile number: 10 digits starting 6–9, with an optional `+91` country
 * code. The single source of truth for phone validation across the API, admin,
 * and mobile. Numbers are validated and stored exactly as entered (no spaces or
 * hyphens) — strip formatting at the input layer before this runs.
 */
export const INDIAN_PHONE_REGEX = /^(?:\+91)?[6-9]\d{9}$/;

export const indianPhone = z
  .string()
  .regex(INDIAN_PHONE_REGEX, "Must be a valid 10-digit Indian phone number");

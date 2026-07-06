import { z } from "zod";

/**
 * Indian mobile number: 10 digits starting 6–9, with an optional `+91` country
 * code accepted on input for convenience. The single source of truth for phone
 * validation across the API, admin, and mobile. This is a whole-country app —
 * every number is Indian — so we DON'T store the country code: the schema
 * normalizes to the bare 10 digits (strips a leading `+91`). Storing one
 * canonical form is what keeps OTP login working — the resident's stored phone
 * and the login lookup are always the same shape. If/when a real SMS provider
 * needs an E.164 number, re-add `+91` at send time in the provider seam, not
 * here. Strip spaces/hyphens at the input layer before this runs.
 */
export const INDIAN_PHONE_REGEX = /^(?:\+91)?[6-9]\d{9}$/;

export const indianPhone = z
  .string()
  .regex(INDIAN_PHONE_REGEX, "Must be a valid 10-digit Indian phone number")
  .transform((v) => v.replace(/^\+91/, ""));

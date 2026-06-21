/** Postgres SQLSTATE for a unique-constraint violation. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * True if `err` — or any error in its `cause` chain — is a Postgres
 * unique-constraint violation.
 *
 * drizzle-orm >= 0.44 wraps the raw `pg` driver error in a `DrizzleQueryError`
 * ("Failed query: …") and moves the original error (the one carrying `.code`)
 * onto `.cause`. Reading `.code` off the top-level error therefore stops
 * matching after the upgrade and a clean 409 silently regresses to a 500. We
 * walk the cause chain so detection works on both the wrapped (>=0.44) and the
 * legacy unwrapped error shapes.
 */
export function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  // Bounded walk — guards against a (pathological) self-referential cause.
  for (let depth = 0; cur != null && depth < 8; depth++) {
    if (
      typeof cur === "object" &&
      (cur as { code?: string }).code === PG_UNIQUE_VIOLATION
    ) {
      return true;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

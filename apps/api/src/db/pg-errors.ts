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

/**
 * The violated constraint's name, walking the `.cause` chain for the same
 * reason as `isUniqueViolation` — drizzle-orm >= 0.44 moves `.constraint`
 * (alongside `.code`) onto `.cause`, so reading it off the top-level error
 * only worked pre-upgrade. Returns undefined if no cause in the chain carries
 * a `.constraint` string (not a Postgres error, or a non-constraint error).
 */
export function pgConstraintName(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let depth = 0; cur != null && depth < 8; depth++) {
    if (typeof cur === "object") {
      const constraint = (cur as { constraint?: string }).constraint;
      if (constraint) return constraint;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

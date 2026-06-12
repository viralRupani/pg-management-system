import { daysInPeriod, istParts, istPeriod } from "../common/ist-date";

/**
 * Prorate a month's rent for a resident based on when they joined, in integer
 * paise. "Join month only" policy:
 *
 *  - joined in an EARLIER month than the period  → full rent (resident the whole month).
 *  - joined in a LATER month than the period      → null (not billable this period; skip — no invoice row).
 *  - joined DURING the period                     → round(rent × activeDays / daysInMonth),
 *      where activeDays counts the join day through month-end inclusive
 *      (join on the 1st → full month).
 *
 * All day/month comparisons are done in IST (see ist-date.ts), because
 * `startDate` is a stored UTC instant and `allocate()` defaults it to now() —
 * raw UTC getters would mis-bill by a day for allocations made in the
 * 18:30–24:00 UTC window.
 */
export function prorateRent(
  rentPaise: number,
  startDate: Date,
  period: string,
): number | null {
  const joinYM = istPeriod(startDate);
  if (joinYM < period) return rentPaise; // joined before this month → full
  if (joinYM > period) return null; // joined after this month → not yet billable

  const daysInMonth = daysInPeriod(period);
  const joinDay = istParts(startDate).day;
  const activeDays = daysInMonth - joinDay + 1;
  return Math.round((rentPaise * activeDays) / daysInMonth);
}

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

/**
 * Prorate a single occupancy SEGMENT against one period, in integer paise: the
 * rent owed for the days of `[segStart, segEndExclusive)` that fall inside
 * `period`. `segEndExclusive` is the move-OUT instant (exclusive — the resident
 * does not occupy that day); pass `null` for an open/active segment that runs to
 * month-end.
 *
 * This generalises `prorateRent` (which is the `segEndExclusive = null` case) so
 * a mid-month room transfer can price the old room (start..moveDay) and the new
 * room (moveDay..end) separately. Day math is IST, same as `prorateRent`.
 *
 *   startDay = segStart before this month ? 1 : its IST day-of-month
 *   endDay   = segEnd after this month (or null) ? daysInMonth : its IST day − 1
 *   days     = max(0, endDay − startDay + 1)
 */
export function prorateSegment(
  rentPaise: number,
  segStart: Date,
  segEndExclusive: Date | null,
  period: string,
): number {
  const daysInMonth = daysInPeriod(period);

  const startYM = istPeriod(segStart);
  if (startYM > period) return 0; // segment starts after this month
  const startDay = startYM < period ? 1 : istParts(segStart).day;

  let endDay: number;
  if (segEndExclusive === null) {
    endDay = daysInMonth; // open segment → through month-end
  } else {
    const endYM = istPeriod(segEndExclusive);
    if (endYM < period) return 0; // segment ended before this month
    endDay = endYM > period ? daysInMonth : istParts(segEndExclusive).day - 1;
  }

  const days = endDay - startDay + 1;
  if (days <= 0) return 0;
  return Math.round((rentPaise * days) / daysInMonth);
}

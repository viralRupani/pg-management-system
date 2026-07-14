/**
 * IST (UTC+5:30) calendar helpers. The business calendar for this product is
 * Indian Standard Time, but timestamps are stored in UTC. Reading a stored
 * `timestamp` with raw UTC getters is off-by-one for ~5.5h every day (the
 * 18:30–24:00 UTC window is already "tomorrow" in IST) — the same trap the
 * admin app documents for menu/budgets. Anything that needs "what day/month is
 * it" for a stored instant must shift into IST first.
 */

const IST_OFFSET_MINUTES = 5 * 60 + 30; // +05:30

/** The given instant's calendar date AS SEEN IN IST. */
export function istParts(d: Date): { year: number; month: number; day: number } {
  // Shift the instant forward by the IST offset, then read UTC components: the
  // shifted instant's UTC wall-clock equals the original's IST wall-clock.
  const shifted = new Date(d.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1, // 1-12
    day: shifted.getUTCDate(),
  };
}

/** The given instant's billing period ('YYYY-MM') as seen in IST. */
export function istPeriod(d: Date): string {
  const { year, month } = istParts(d);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * The UTC instant of IST-midnight on the given instant's IST calendar date —
 * i.e. "start of today in IST" as a real timestamp. Use this as the cutoff for
 * day-granular calendar comparisons against stored UTC timestamps: an invoice
 * whose `due_date` is before this instant has had its due IST-day fully pass.
 * Comparing a stored timestamp to raw `now()` instead is off by 5.5h and flips
 * a day early/late around the IST midnight boundary (see file header).
 */
export function istStartOfDayUtc(d: Date): Date {
  const { year, month, day } = istParts(d);
  // IST = UTC + 05:30, so the UTC instant of IST-midnight is that date at 00:00
  // minus the offset.
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MINUTES * 60_000);
}

/**
 * The real UTC instant of an IST wall-clock moment: `(period, day, hour,
 * minute)` read in IST. Used by the scheduled-invoice dispatcher to decide
 * whether a per-PG schedule's moment has arrived — `period` is the current IST
 * billing month ('YYYY-MM'), and the returned instant is compared to `now`.
 * IST = UTC + 05:30, so subtract the offset from the naive UTC instant.
 */
export function istMomentUtc(
  period: string,
  day: number,
  hour: number,
  minute: number,
): Date {
  const [year, month] = period.split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MINUTES * 60_000,
  );
}

/** Number of days in a 'YYYY-MM' period (handles leap Februaries). */
export function daysInPeriod(period: string): number {
  const [year, month] = period.split("-").map(Number);
  // Day 0 of the next month == last day of this month.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `period` shifted by `n` calendar months (may be negative), e.g.
 * `addMonthsToPeriod('2026-01', -1) === '2025-12'`. Pure integer arithmetic —
 * a billing period has no time-of-day, so there's no IST/UTC ambiguity here. */
export function addMonthsToPeriod(period: string, n: number): string {
  const [year, month] = period.split("-").map(Number);
  const total = year * 12 + (month - 1) + n;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

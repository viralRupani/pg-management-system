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

/** Number of days in a 'YYYY-MM' period (handles leap Februaries). */
export function daysInPeriod(period: string): number {
  const [year, month] = period.split("-").map(Number);
  // Day 0 of the next month == last day of this month.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

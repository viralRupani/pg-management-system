import { initialLastRunPeriod } from "./invoice-schedule.service";
import { istPeriod } from "../common/ist-date";

/**
 * The seed decision for a freshly created schedule: fire THIS month if its day
 * is still ahead (lastRunPeriod = null), but don't back-fire for a day that has
 * already passed (lastRunPeriod = current period). All times are IST.
 */
describe("initialLastRunPeriod", () => {
  // 2026-06-15T08:00:00Z == 13:30 IST on the 15th of June.
  const now = new Date("2026-06-15T08:00:00Z");

  it("seeds the current period when this month's moment has already passed", () => {
    // Day 5 @ 09:00 is days behind the 15th → would back-fire, so it's blocked.
    expect(initialLastRunPeriod(now, 5, 9, 0)).toBe(istPeriod(now)); // "2026-06"
    // Same day, earlier time also counts as passed.
    expect(initialLastRunPeriod(now, 15, 10, 0)).toBe(istPeriod(now));
  });

  it("returns null when this month's moment is still ahead → fires this month", () => {
    // Day 28 is ahead of the 15th.
    expect(initialLastRunPeriod(now, 28, 9, 0)).toBeNull();
    // Same day, later time is still ahead.
    expect(initialLastRunPeriod(now, 15, 18, 0)).toBeNull();
  });
});

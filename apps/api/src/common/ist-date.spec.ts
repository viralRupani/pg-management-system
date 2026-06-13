import { istStartOfDayUtc, istPeriod, daysInPeriod } from "./ist-date";

/**
 * Guards the IST calendar helpers — specifically the boundary `istStartOfDayUtc`
 * exists to get right. Stored timestamps are UTC but the business calendar is
 * IST (UTC+5:30), so the 18:30–24:00 UTC window is already "tomorrow" in IST.
 * The overdue cutoff and join-month proration both depend on this being exact.
 */
describe("ist-date", () => {
  describe("istStartOfDayUtc", () => {
    it("returns the UTC instant of IST-midnight for the IST date", () => {
      // 2026-06-11T02:30:00Z is 08:00 IST on the 11th → IST day start is
      // 2026-06-11T00:00 IST = 2026-06-10T18:30:00Z.
      expect(istStartOfDayUtc(new Date("2026-06-11T02:30:00Z")).toISOString()).toBe(
        "2026-06-10T18:30:00.000Z",
      );
    });

    it("rolls to the next IST day past 18:30 UTC (the off-by-one trap)", () => {
      // 2026-06-10T19:00:00Z is already 00:30 IST on the 11th → day start jumps
      // to the 11th's IST midnight, NOT the 10th's.
      expect(istStartOfDayUtc(new Date("2026-06-10T19:00:00Z")).toISOString()).toBe(
        "2026-06-10T18:30:00.000Z",
      );
    });

    it("makes a due-on-the-10th invoice overdue only from the 11th in IST", () => {
      const dueDate = new Date("2026-06-10T00:00:00Z"); // the generated due date
      // On the 10th (any IST time), the cutoff is the 10th's start → not overdue.
      expect(dueDate < istStartOfDayUtc(new Date("2026-06-10T16:00:00Z"))).toBe(false);
      // On the 11th in IST, the cutoff is the 11th's start → overdue.
      expect(dueDate < istStartOfDayUtc(new Date("2026-06-10T19:00:00Z"))).toBe(true);
    });
  });

  describe("istPeriod / daysInPeriod", () => {
    it("reads the period in IST, not UTC, at the month boundary", () => {
      // 2026-05-31T20:00:00Z is 01:30 IST on June 1st → June, not May.
      expect(istPeriod(new Date("2026-05-31T20:00:00Z"))).toBe("2026-06");
    });

    it("counts days per month including leap February", () => {
      expect(daysInPeriod("2026-06")).toBe(30);
      expect(daysInPeriod("2024-02")).toBe(29);
      expect(daysInPeriod("2026-02")).toBe(28);
    });
  });
});

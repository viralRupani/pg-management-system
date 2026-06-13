import { prorateRent, prorateSegment } from "./rent.proration";

/**
 * Unit coverage for the pure join-month proration rule. Amounts are integer
 * paise. ₹8000 == 800000 paise is the worked example.
 */
describe("prorateRent", () => {
  const RENT = 800000; // ₹8000

  // A bare date-only string is parsed as UTC midnight; in IST that's 05:30 the
  // same calendar day, so the IST day == the written day. Used for the clear cases.
  const at = (iso: string) => new Date(iso);

  it("joined before the period → full rent", () => {
    expect(prorateRent(RENT, at("2026-05-20"), "2026-06")).toBe(RENT);
    expect(prorateRent(RENT, at("2025-01-01"), "2026-06")).toBe(RENT);
  });

  it("joined after the period → null (not yet billable)", () => {
    expect(prorateRent(RENT, at("2026-07-01"), "2026-06")).toBeNull();
    expect(prorateRent(RENT, at("2027-01-15"), "2026-06")).toBeNull();
  });

  it("joined on the 1st of the period → full rent", () => {
    expect(prorateRent(RENT, at("2026-06-01"), "2026-06")).toBe(RENT);
  });

  it("joined mid-period → prorated by calendar days", () => {
    // June has 30 days; join on the 10th → days 10..30 inclusive = 21 days.
    expect(prorateRent(RENT, at("2026-06-10"), "2026-06")).toBe(
      Math.round((RENT * 21) / 30),
    );
    expect(prorateRent(RENT, at("2026-06-10"), "2026-06")).toBe(560000);
  });

  it("joined on the last day of the period → one day's rent", () => {
    // June 30 → 1 active day of 30.
    expect(prorateRent(RENT, at("2026-06-30"), "2026-06")).toBe(
      Math.round(RENT / 30),
    );
  });

  it("divisor follows actual month length (Feb)", () => {
    // 2026 Feb has 28 days; join on the 15th → 28-15+1 = 14 days.
    expect(prorateRent(RENT, at("2026-02-15"), "2026-02")).toBe(
      Math.round((RENT * 14) / 28),
    );
    // 2028 is a leap year → Feb has 29 days; join on the 15th → 15 days.
    expect(prorateRent(RENT, at("2028-02-15"), "2028-02")).toBe(
      Math.round((RENT * 15) / 29),
    );
  });

  it("uses the IST calendar day, not the UTC day (regression for now()-defaults)", () => {
    // 2026-06-09T20:00:00Z is the 9th in UTC but 2026-06-10T01:30 in IST, so it
    // must prorate as a join on the 10th (21 days), not the 9th (22 days).
    expect(prorateRent(RENT, new Date("2026-06-09T20:00:00Z"), "2026-06")).toBe(
      Math.round((RENT * 21) / 30),
    );
    // A UTC instant late on Jun 30 that is already Jul 1 in IST belongs to the
    // NEXT period → null for June.
    expect(
      prorateRent(RENT, new Date("2026-06-30T19:00:00Z"), "2026-06"),
    ).toBeNull();
  });
});

/**
 * Unit coverage for the segment proration used by mid-month room transfers.
 * `segEndExclusive` is the move-out instant (the resident does NOT occupy that
 * day). ₹9000 == 900000 paise is divisible by 30 so June math is exact.
 */
describe("prorateSegment", () => {
  const RENT = 900000; // ₹9000
  const at = (iso: string) => new Date(iso);
  const PERIOD = "2026-06"; // 30 days

  it("open segment starting before/on the 1st → full rent", () => {
    expect(prorateSegment(RENT, at("2026-05-01"), null, PERIOD)).toBe(RENT);
    expect(prorateSegment(RENT, at("2026-06-01"), null, PERIOD)).toBe(RENT);
  });

  it("open segment starting mid-month → from start day through month-end", () => {
    // days 15..30 inclusive = 16 days.
    expect(prorateSegment(RENT, at("2026-06-15"), null, PERIOD)).toBe(
      Math.round((RENT * 16) / 30),
    );
  });

  it("closed segment → start day through the day BEFORE move-out", () => {
    // Jun 1 → Jun 15 (exclusive): days 1..14 = 14 days (the old-room side).
    expect(prorateSegment(RENT, at("2026-06-01"), at("2026-06-15"), PERIOD)).toBe(
      Math.round((RENT * 14) / 30),
    );
    // Start before the period clamps to day 1.
    expect(prorateSegment(RENT, at("2026-05-01"), at("2026-06-15"), PERIOD)).toBe(
      Math.round((RENT * 14) / 30),
    );
  });

  it("segment ending in a later month clamps to month-end", () => {
    // Jun 10 → Jul 5: days 10..30 = 21 days.
    expect(prorateSegment(RENT, at("2026-06-10"), at("2026-07-05"), PERIOD)).toBe(
      Math.round((RENT * 21) / 30),
    );
  });

  it("segment outside the period → zero", () => {
    expect(prorateSegment(RENT, at("2026-04-01"), at("2026-05-01"), PERIOD)).toBe(0);
    expect(prorateSegment(RENT, at("2026-07-01"), null, PERIOD)).toBe(0);
    // Same-day move in and out → zero occupied days.
    expect(prorateSegment(RENT, at("2026-06-10"), at("2026-06-10"), PERIOD)).toBe(0);
  });

  it("old-room + new-room portions of a transfer sum to a full month", () => {
    // The core invariant: splitting a month at the move day never over- or
    // under-bills when both rooms cost the same.
    const move = at("2026-06-15");
    const oldSide = prorateSegment(RENT, at("2026-06-01"), move, PERIOD);
    const newSide = prorateSegment(RENT, move, null, PERIOD);
    expect(oldSide + newSide).toBe(RENT);
  });
});

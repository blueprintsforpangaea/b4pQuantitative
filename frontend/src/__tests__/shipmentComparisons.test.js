import { describe, expect, it } from "vitest";
import {
  comparePeriods,
  percentChange,
  periodRanges,
  trackStatus,
} from "../lib/shipmentComparisons.js";

const e = (shipmentDate, shipmentValue, shipmentItems) => ({ shipmentDate, shipmentValue, shipmentItems });

describe("percentChange", () => {
  it("returns null with no baseline", () => {
    expect(percentChange(5, 0)).toBeNull();
  });
  it("computes signed percent", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
  });
});

describe("periodRanges", () => {
  it("compares month to date with the same span of last month", () => {
    const r = periodRanges("month", "2026-10-14");
    expect(r.current).toEqual(["2026-10-01", "2026-10-14"]);
    expect(r.prior).toEqual(["2026-09-01", "2026-09-14"]);
    expect(r.priorFull).toEqual(["2026-09-01", "2026-09-30"]);
    expect(r.periodDays).toBe(31);
  });
  it("clamps the day to a shorter prior month", () => {
    expect(periodRanges("month", "2026-03-31").prior).toEqual(["2026-02-01", "2026-02-28"]);
  });
  it("wraps January to December of the prior year", () => {
    expect(periodRanges("month", "2026-01-10").prior).toEqual(["2025-12-01", "2025-12-10"]);
  });
  it("clamps Feb 29 against a non-leap prior year", () => {
    const r = periodRanges("year", "2028-02-29");
    expect(r.prior).toEqual(["2027-01-01", "2027-02-28"]);
    expect(r.periodDays).toBe(366);
    expect(r.elapsedDays).toBe(60);
  });
});

describe("trackStatus", () => {
  it("classifies against the tolerance", () => {
    expect(trackStatus(120, 100)).toBe("ahead");
    expect(trackStatus(103, 100)).toBe("on-track");
    expect(trackStatus(80, 100)).toBe("behind");
    expect(trackStatus(5, 0)).toBe("no-baseline");
    expect(trackStatus(0, 0)).toBe("none");
  });
});

describe("comparePeriods", () => {
  const entries = [
    e("2026-10-02", 100, 10),
    e("2026-10-12", 50, 5),
    e("2026-10-20", 999, 99), // after today, excluded
    e("2026-09-05", 80, 8),
    e("2026-09-25", 400, 40), // outside same span, in full prior month
    e("2025-10-01", 70, 7),
    e("2025-03-01", 30, 3),
    { shipmentDate: "", shipmentValue: 5, shipmentItems: 1 },
  ];

  it("month over month", () => {
    const c = comparePeriods(entries, "month", "2026-10-14");
    expect(c.shipments).toMatchObject({ current: 2, prior: 1, priorFull: 2, status: "ahead" });
    expect(c.value).toMatchObject({ current: 150, prior: 80, priorFull: 480 });
    expect(c.units.current).toBe(15);
    expect(c.value.pct).toBeCloseTo(87.5);
    expect(c.value.projected).toBeCloseTo((150 / 14) * 31);
  });

  it("year over year", () => {
    const c = comparePeriods(entries, "year", "2026-10-14");
    expect(c.shipments.current).toBe(4);
    expect(c.shipments.prior).toBe(2);
    expect(c.value.priorFull).toBe(100);
    expect(c.value.status).toBe("ahead");
  });

  it("handles empty data", () => {
    const c = comparePeriods([], "month", "2026-10-14");
    expect(c.value).toMatchObject({ current: 0, prior: 0, pct: null, status: "none" });
  });
});

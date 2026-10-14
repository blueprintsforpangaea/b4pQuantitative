import { describe, expect, it } from "vitest";
import { buildBreakdown, inventoryTiles, latestPallet, palletIds } from "../lib/breakdown.js";

// Synthetic rows only.
const row = (id, o = {}) => ({
  id, quantity: 10, valuation: 100, category: "Gloves", expiryTier: "ok", durationFilter: "0-30 days",
  supplyWorkflowStatus: "Inventory", palletNumber: "1", ...o,
});

describe("buildBreakdown", () => {
  const rows = [
    row("a", { expiryTier: "expired", quantity: 5, valuation: 50 }),
    row("b", { expiryTier: "d30", quantity: 15, valuation: 10 }),
    row("c", { expiryTier: "ok", quantity: 30, valuation: 40 }),
  ];

  it("orders expiry tiers red to gray, drops empty ones and computes shares", () => {
    const { total, segments } = buildBreakdown(rows, "expiry", "units");
    expect(total).toBe(50);
    expect(segments.map((s) => s.id)).toEqual(["expired", "d30", "ok"]);
    expect(segments.map((s) => Math.round(s.percent))).toEqual([10, 30, 60]);
    expect(segments[0].filter).toEqual({ type: "tier", values: ["expired"] });
  });

  it("switches the measure to dollars", () => {
    const { total, segments } = buildBreakdown(rows, "expiry", "value");
    expect(total).toBe(100);
    expect(segments.map((s) => s.value)).toEqual([50, 10, 40]);
  });

  it("folds categories past eight into one neutral Other that filters to all of them", () => {
    const many = Array.from({ length: 11 }, (_, i) => row(`r${i}`, { category: `Cat ${String(i).padStart(2, "0")}`, quantity: 100 - i }));
    const { segments } = buildBreakdown(many, "category", "units");
    expect(segments).toHaveLength(9);
    const other = segments[8];
    expect(other.label).toBe("Other (3)");
    expect(other.filter.values).toEqual(["Cat 08", "Cat 09", "Cat 10"]);
    expect(segments[0].label).toBe("Cat 00");
  });

  it("breaks down workflow status by units from allocations, and time in warehouse", () => {
    const mixed = [
      row("a", { quantity: 10, availableUnits: 6, pulledUnits: 4, consolidatedUnits: 0, unitPrice: 2 }),
      row("b", { quantity: 5, availableUnits: 0, pulledUnits: 0, consolidatedUnits: 5, unitPrice: 1 }),
      row("c", { durationFilter: "31-90 days" }),
    ];
    const units = buildBreakdown(mixed, "workflow", "units");
    expect(units.segments.map((s) => [s.id, s.value])).toEqual([["Inventory", 16], ["Pulled", 4], ["Consolidated", 5]]);
    expect(buildBreakdown(mixed, "workflow", "value").segments.map((s) => s.value)).toEqual([12, 8, 5]);
    expect(buildBreakdown(mixed, "duration").segments.map((s) => s.id)).toEqual(["0-30 days", "31-90 days"]);
  });

  it("returns an empty breakdown for no rows", () => {
    expect(buildBreakdown([], "expiry")).toEqual({ total: 0, segments: [] });
  });
});

describe("inventoryTiles", () => {
  it("answers the four headline questions", () => {
    const rows = [
      row("a", { expiryTier: "expired", quantity: 10 }),
      row("b", { expiryTier: "expired", quantity: 6 }),
      row("c", { expiryTier: "d30", quantity: 4 }),
      row("d", { expiryTier: "d90", quantity: 3 }),
      row("e", { expiryTier: "ok", quantity: 20 }),
    ];
    const byItem = new Map([["a", { pulled: 4, shipments: [] }]]);
    const tiles = inventoryTiles(rows, byItem, { pulledUnits: 4, consolidatedUnits: 7 });
    expect(tiles.totalUnits).toBe(43);
    expect(tiles.expiredUnits).toBe(16);
    expect(tiles.needsPulling).toBe(12); // 16 expired minus the 4 already pulled
    expect(tiles.expiringUnits).toBe(7);
    expect(tiles.movingUnits).toBe(11);
  });

  it("never lets pulled units exceed on-hand when computing needs pulling", () => {
    const tiles = inventoryTiles([row("a", { expiryTier: "expired", quantity: 5 })], new Map([["a", { pulled: 9 }]]), null);
    expect(tiles.needsPulling).toBe(0);
  });
});

describe("pallets", () => {
  it("sorts numerically and picks the highest as latest", () => {
    const rows = [row("a", { palletNumber: "10" }), row("b", { palletNumber: "2" }), row("c", { palletNumber: "Unassigned" })];
    expect(palletIds(rows)).toEqual(["2", "10"]);
    expect(latestPallet(rows)).toBe("10");
    expect(latestPallet([])).toBe("");
  });
});

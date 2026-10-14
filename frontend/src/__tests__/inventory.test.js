import { describe, expect, it } from "vitest";
import { allocationTags, applyAllocations, expiryTierId, groupByProduct, productKey, productName } from "../lib/inventory.js";

describe("productName", () => {
  it.each([
    ["Nitrile exam gloves M", "Nitrile exam gloves"],
    ["Nitrile exam gloves L", "Nitrile exam gloves"],
    ["Nitrile exam gloves, XL", "Nitrile exam gloves"],
    ["Nitrile exam gloves - Medium", "Nitrile exam gloves"],
    ["Surgical gown (Large)", "Surgical gown"],
    ["Surgical gown XXL", "Surgical gown"],
    ["Sterile gloves 7.5", "Sterile gloves"],
    ["Sterile gloves size 8", "Sterile gloves"],
    ["IV catheter 18G", "IV catheter"],
    ["Gauze pad 4x4", "Gauze pad"],
    ['Gauze pad 4" x 4"', "Gauze pad"],
    ["Syringe 10 mL", "Syringe"],
    ["Tape 1 inch", "Tape"],
  ])("%s -> %s", (input, expected) => {
    expect(productName(input)).toBe(expected);
  });

  it("leaves names without a trailing size alone", () => {
    expect(productName("Pulse oximeter")).toBe("Pulse oximeter");
    expect(productName("COVID-19 antigen test")).toBe("COVID-19 antigen test");
    expect(productName("Vitamin B12")).toBe("Vitamin B12");
    expect(productName("Stethoscope S")).toBe("Stethoscope");
  });

  it("never returns an empty name", () => {
    expect(productName("M")).toBe("M");
    expect(productName("  ")).toBe("");
    expect(productName(null)).toBe("");
  });

  it("keys ignore case and spacing", () => {
    expect(productKey("Nitrile  Exam Gloves M")).toBe(productKey("nitrile exam gloves L"));
  });
});

describe("groupByProduct", () => {
  const row = (id, name, quantity, days, valuation = quantity) => ({
    id, supplyId: id, exactSupplyName: name, category: "Gloves", quantity, valuation,
    expirationDaysLeft: days, palletSortValue: 1, boxType: "ER", boxNumber: 1,
  });

  it("collapses size variants, totals them, and sorts groups alphabetically", () => {
    const groups = groupByProduct([
      row("1", "Nitrile exam gloves M", 10, 200),
      row("2", "Nitrile exam gloves L", 5, 40),
      row("3", "Bandage roll", 3, null),
      row("4", "Nitrile exam gloves M", 2, -3),
    ]);
    expect(groups.map((group) => group.name)).toEqual(["Bandage roll", "Nitrile exam gloves"]);
    const gloves = groups[1];
    expect(gloves.rows).toHaveLength(3);
    expect(gloves.totalQuantity).toBe(17);
    expect(gloves.soonestDaysLeft).toBe(-3);
    expect(gloves.rows.map((entry) => entry.id)).toEqual(["4", "2", "1"]); // soonest expiry first
    expect(groups[0].soonestDaysLeft).toBeNull();
  });
});

describe("expiryTierId", () => {
  it("maps days left to the five legend tiers", () => {
    expect(expiryTierId(null)).toBe("none");
    expect(expiryTierId(-1)).toBe("expired");
    expect(expiryTierId(0)).toBe("expired");
    expect(expiryTierId(1)).toBe("d30");
    expect(expiryTierId(30)).toBe("d30");
    expect(expiryTierId(31)).toBe("d90");
    expect(expiryTierId(90)).toBe("d90");
    expect(expiryTierId(91)).toBe("ok");
  });
});

describe("applyAllocations and allocationTags", () => {
  const lot = (id, quantity) => ({ id, supplyId: id, quantity });
  const byItem = new Map([
    ["part", { pulled: 40, shipments: [{ shipment_id: "s1", shipment_name: "Run A", stage: "pulling", quantity: 40 }] }],
    ["all", { pulled: 50, shipments: [{ shipment_id: "s1", stage: "planned", quantity: 50 }] }],
    ["cons", { pulled: 30, shipments: [{ shipment_id: "s2", stage: "consolidated", quantity: 30 }] }],
    ["over", { pulled: 99, shipments: [{ shipment_id: "s1", stage: "pulling", quantity: 99 }] }],
  ]);
  const rows = applyAllocations([lot("part", 150), lot("all", 50), lot("cons", 30), lot("none", 10), lot("over", 20)], byItem);
  const by = Object.fromEntries(rows.map((row) => [row.id, row]));

  it("derives available = on hand - allocated and clamps over-allocation", () => {
    expect([by.part.availableUnits, by.part.pulledUnits]).toEqual([110, 40]);
    expect([by.all.availableUnits, by.all.pulledUnits]).toEqual([0, 50]);
    expect([by.cons.availableUnits, by.cons.consolidatedUnits]).toEqual([0, 30]);
    expect([by.over.pulledUnits, by.over.availableUnits]).toEqual([20, 0]);
    expect(by.none.availableUnits).toBe(10);
  });

  it("tags a partly pulled lot Available + N pulled, and keeps it selectable", () => {
    expect(allocationTags([by.part]).map((tag) => tag.label)).toEqual(["Available", "40 pulled"]);
    expect(by.part.inventoryStatus).toBe("Available");
    expect(by.part.workflowStatuses).toEqual(["Inventory", "Pulled"]);
  });

  it("tags a fully pulled lot with one tag, Consolidated when every allocation is consolidated", () => {
    expect(allocationTags([by.all]).map((tag) => tag.label)).toEqual(["All 50 pulled"]);
    expect(allocationTags([by.cons]).map((tag) => tag.label)).toEqual(["Consolidated"]);
    expect(by.all.inventoryStatus).toBe("Pulled");
    expect(by.cons.inventoryStatus).toBe("Consolidated");
  });

  it("aggregates a group the same way", () => {
    expect(allocationTags([by.part, by.all, by.none]).map((tag) => tag.label)).toEqual(["Available", "90 pulled"]);
    expect(allocationTags([by.all, by.over]).map((tag) => tag.label)).toEqual(["All 70 pulled"]);
    expect(allocationTags([by.none]).map((tag) => tag.label)).toEqual(["Available"]);
  });
});

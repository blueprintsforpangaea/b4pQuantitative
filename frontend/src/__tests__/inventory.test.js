import { describe, expect, it } from "vitest";
import { expiryTierId, groupByProduct, productKey, productName } from "../lib/inventory.js";

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

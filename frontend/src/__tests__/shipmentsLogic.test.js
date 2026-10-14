import { describe, expect, it } from "vitest";
import {
  autoStageAfterTick,
  buildImportBody,
  formatLocation,
  groupLinesByProduct,
  parseRequestIds,
  shipmentTotals,
  stageFromLines,
  toLegacyShipments,
  validateQuantity,
} from "../lib/shipmentsLogic.js";

const line = (over = {}) => ({ id: "1", item_id: "a", name: "Test gloves", quantity: 5, picked: false, consolidated: false, ...over });

describe("stage from ticks", () => {
  it("planned with no ticks, pulling with any pick, consolidated when all consolidated", () => {
    expect(stageFromLines([line(), line({ id: "2", item_id: "b" })])).toBe("planned");
    expect(stageFromLines([line({ picked: true }), line({ id: "2", item_id: "b" })])).toBe("pulling");
    expect(stageFromLines([line({ consolidated: true }), line({ id: "2", item_id: "b", consolidated: true })])).toBe("consolidated");
  });
  it("ignores free-text lines and empty shipments", () => {
    expect(stageFromLines([])).toBe("planned");
    expect(stageFromLines([line({ consolidated: true }), line({ id: "9", item_id: null })])).toBe("consolidated");
  });
  it("never auto-moves a shipped shipment", () => {
    expect(autoStageAfterTick({ stage: "shipped" }, [line({ picked: true })])).toBeNull();
    expect(autoStageAfterTick({ stage: "planned" }, [line({ picked: true })])).toBe("pulling");
    expect(autoStageAfterTick({ stage: "pulling" }, [line({ picked: true })])).toBeNull();
  });
});

describe("formatLocation", () => {
  it("shows pallet, box category and box number", () => {
    expect(formatLocation(line({ pallet_number: 3, category_box: "Gloves", box_number: 12 }))).toBe("Pallet 3 / Gloves #12");
  });
  it("handles unassigned and free-text", () => {
    expect(formatLocation(line({ pallet_number: 0, category_box: "Unassigned", box_number: 0 }))).toBe("Pallet unassigned / box unassigned");
    expect(formatLocation(line({ item_id: null, pallet_number: null }))).toBe("No location");
  });
});

describe("groupLinesByProduct", () => {
  it("keeps each lot as its own line under the product, soonest expiry first", () => {
    const groups = groupLinesByProduct([
      line({ id: "1", lot_number: "L2", expiration_date: "2027-05-01" }),
      line({ id: "2", item_id: "b", lot_number: "L1", expiration_date: "2026-12-01", quantity: 3 }),
      line({ id: "3", item_id: "c", name: "Another item" }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Another item", "Test gloves"]);
    expect(groups[1].lines.map((l) => l.id)).toEqual(["2", "1"]);
    expect(groups[1].units).toBe(8);
  });
});

describe("validateQuantity", () => {
  it("checks whole numbers and max_quantity", () => {
    expect(validateQuantity("0", line())).not.toBe("");
    expect(validateQuantity("2.5", line())).not.toBe("");
    expect(validateQuantity("6", line({ max_quantity: 5 }))).toMatch(/Only 5/);
    expect(validateQuantity("5", line({ max_quantity: 5 }))).toBe("");
    expect(validateQuantity("500", line({ max_quantity: null }))).toBe("");
  });
});

describe("totals and request ids", () => {
  it("falls back to unit_count/value without lines", () => {
    expect(shipmentTotals({ lines: [], unit_count: 40, value: 900 })).toEqual({ line_count: 0, units: 40, value: 900 });
    expect(shipmentTotals({ lines: [line({ unit_price: 2 })] })).toEqual({ line_count: 1, units: 5, value: 10 });
  });
  it("parses and de-duplicates request ids", () => {
    expect(parseRequestIds("REQ-1, REQ-2\nREQ-1  REQ-3")).toEqual(["REQ-1", "REQ-2", "REQ-3"]);
    expect(parseRequestIds("")).toEqual([]);
  });
});

describe("legacy import and adapter", () => {
  const old = [
    { id: "s1", recipientName: "Test Clinic", shipmentType: "National", pointOfContact: "Sam Example", items: [
      { id: "i1", name: "Gloves", quantity: 40, requestedQuantity: 25, unitPrice: 0.5, isConsolidated: true } ] },
    { id: "s2", recipientName: "Done Clinic", isCompleted: true, pastShipmentStatus: "Delivered", deliveryDate: "2026-03-20", shippedAt: "2026-03-06", items: [] },
    { id: "s3", recipientName: "Empty planned", items: [] },
  ];
  it("maps stage, contact, quantities and drops empty drafts", () => {
    const body = buildImportBody(old, [{ id: "n1", clinicName: "Clinic Z", valuation: 120, shippedAt: "2026-02-01" }]);
    expect(body.shipments).toHaveLength(2);
    expect(body.shipments[0]).toMatchObject({ id: "s1", stage: "consolidated", shipment_type: "International", blueprints_contact: "Sam Example" });
    expect(body.shipments[0].lines[0]).toMatchObject({ quantity: 25, unit_price: 0.5 });
    expect(body.shipments[1]).toMatchObject({ stage: "delivered", delivered_date: "2026-03-20" });
    expect(body.non_inventory[0]).toMatchObject({ clinicName: "Clinic Z", valuation: 120 });
  });
  it("adapts API shipments for KPI code", () => {
    const { shipments, nonInventoryShipments } = toLegacyShipments([
      { id: "A", kind: "inventory", name: "Clinic", stage: "shipped", ship_date: "2026-10-02", lines: [{ id: "1", item_id: "x", name: "G", quantity: 4, unit_price: 2, consolidated: true }] },
      { id: "B", kind: "non_inventory", name: "Z", recipient: "Z", stage: "shipped", ship_date: "2026-09-01", value: 300 },
    ]);
    expect(shipments[0]).toMatchObject({ isCompleted: true, shippedAt: "2026-10-02" });
    expect(shipments[0].items[0]).toMatchObject({ requestedQuantity: 4, unitPrice: 2 });
    expect(nonInventoryShipments[0]).toMatchObject({ valuation: 300, shippedAt: "2026-09-01" });
  });
});

import { allocatedByItem, expiryTier, linesWithItemAdded, linesWithQuantity, linesWithout } from "../lib/shipmentsLogic.js";

describe("line edit helpers", () => {
  const lines = [
    { id: "1", item_id: "a", name: "G", quantity: 5 },
    { id: "2", item_id: null, name: "Donated crutches", quantity: 2, unit_price: 10 },
  ];
  it("adds a new item or raises the quantity of an existing one", () => {
    expect(linesWithItemAdded(lines, "b", 3)).toEqual([
      { item_id: "a", quantity: 5 },
      { description: "Donated crutches", quantity: 2, unit_price: 10, lot_number: undefined, expiration_date: undefined },
      { item_id: "b", quantity: 3 },
    ]);
    expect(linesWithItemAdded(lines, "a", 2)[0]).toEqual({ item_id: "a", quantity: 7 });
  });
  it("changes one quantity and removes one line", () => {
    expect(linesWithQuantity(lines, "1", 9)[0].quantity).toBe(9);
    expect(linesWithout(lines, "1")).toHaveLength(1);
    expect(linesWithout(lines, "1")[0].description).toBe("Donated crutches");
  });
  it("sums active allocations only", () => {
    const map = allocatedByItem([
      { stage: "pulling", lines: [{ item_id: "a", quantity: 4 }] },
      { stage: "planned", lines: [{ item_id: "a", quantity: 1 }, { item_id: null, quantity: 9 }] },
      { stage: "shipped", lines: [{ item_id: "a", quantity: 100 }] },
    ]);
    expect(map.get("a")).toBe(5);
  });
  it("tiers expiry", () => {
    expect(expiryTier("2026-01-01", "2026-06-01")).toBe("expired");
    expect(expiryTier("2026-06-20", "2026-06-01")).toBe("d30");
    expect(expiryTier("2026-08-01", "2026-06-01")).toBe("d90");
    expect(expiryTier("2027-06-01", "2026-06-01")).toBe("later");
    expect(expiryTier(null)).toBe("none");
  });
});

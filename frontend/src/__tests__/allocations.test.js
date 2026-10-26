import { describe, expect, it } from "vitest";
import { availableQty, groupAllocationsByItem, summarizeAllocations } from "../lib/shipments.js";

const rows = [
  { item_id: "x1", shipment_id: "S1", shipment_name: "Clinic A", stage: "pulling", quantity: 10 },
  { item_id: "x1", shipment_id: "S2", shipment_name: "Clinic B", stage: "consolidated", quantity: 5 },
  { item_id: 7, shipment_id: "S2", shipment_name: "Clinic B", stage: "planned", quantity: 2 },
];

describe("allocations helpers", () => {
  it("groups by item and sums pulled units", () => {
    const byItem = groupAllocationsByItem(rows);
    expect(byItem.get("x1").pulled).toBe(15);
    expect(byItem.get("x1").shipments).toHaveLength(2);
    expect(byItem.get("7").pulled).toBe(2);
  });
  it("computes available quantity, floored at zero", () => {
    const byItem = groupAllocationsByItem(rows);
    expect(availableQty(40, byItem, "x1")).toBe(25);
    expect(availableQty(10, byItem, "x1")).toBe(0);
    expect(availableQty(9, byItem, "none")).toBe(9);
  });
  it("summarizes pulled vs consolidated", () => {
    expect(summarizeAllocations(rows)).toEqual({ pulledUnits: 12, consolidatedUnits: 5 });
  });
});

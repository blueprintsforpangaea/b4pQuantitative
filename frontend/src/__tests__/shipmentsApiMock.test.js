import { describe, expect, it } from "vitest";
import { createMockApi } from "../lib/shipmentsApi.js";

const inventory = [
  { id: "a1", name: "Test gloves M", category: "Gloves", quantity: 10, unit_value: 2, expiration_date: "2020-01-01", lot_number: "L1", pallet_number: 3, category_box: "Gloves", box_number: 7 },
  { id: "a2", name: "Test gloves M", category: "Gloves", quantity: 4, unit_value: 2, expiration_date: null, lot_number: "L2", pallet_number: 5, category_box: "Gloves", box_number: 2 },
];

describe("mock shipments API follows the contract", () => {
  it("creates a shipment with location, expiry and availability", async () => {
    const api = createMockApi(inventory);
    const s = await api.create({ name: "Clinic A", lines: [{ item_id: "a1", quantity: 6 }] });
    expect(s.stage).toBe("planned");
    expect(s.lines[0]).toMatchObject({ pallet_number: 3, box_number: 7, expiry_status: "expired", on_hand: 10, available: 4, max_quantity: 10 });
  });

  it("rejects over-allocation across active shipments with a 409", async () => {
    const api = createMockApi(inventory);
    await api.create({ name: "A", lines: [{ item_id: "a2", quantity: 3 }] });
    await expect(api.create({ name: "B", lines: [{ item_id: "a2", quantity: 2 }] })).rejects.toMatchObject({ status: 409, body: { item_id: "a2", requested: 2, available: 1 } });
  });

  it("shipping takes stock once and freezes lines; stage cannot move back", async () => {
    const api = createMockApi(inventory);
    const s = await api.create({ name: "A", lines: [{ item_id: "a1", quantity: 6 }] });
    await api.patch(s.id, { stage: "shipped" });
    const shipped = await api.get(s.id);
    expect(shipped.ship_date).toBeTruthy();
    expect(shipped.lines[0].on_hand).toBe(4);
    await expect(api.putLines(s.id, [])).rejects.toMatchObject({ status: 409 });
    await expect(api.patch(s.id, { stage: "planned" })).rejects.toMatchObject({ status: 409 });
  });

  it("splits scopes and import is idempotent", async () => {
    const api = createMockApi(inventory);
    const s = await api.create({ name: "A", lines: [{ item_id: "a1", quantity: 1 }] });
    await api.patch(s.id, { stage: "shipped" });
    await api.create({ name: "B" });
    expect((await api.list("active")).map((x) => x.name)).toEqual(["B"]);
    expect((await api.list("past")).map((x) => x.name)).toEqual(["A"]);
    const body = { shipments: [], non_inventory: [{ id: "n1", clinicName: "Clinic Z", valuation: 50, shippedAt: "2026-02-01" }] };
    expect(await api.importOld(body)).toMatchObject({ created: 1, skipped: 0 });
    expect(await api.importOld(body)).toMatchObject({ created: 0, skipped: 1 });
    expect((await api.get("n1")).totals.value).toBe(50);
  });
});

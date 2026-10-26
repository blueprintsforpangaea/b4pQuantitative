// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_SHIPMENTS_KEY, LOCAL_SHIPMENTS_KEY, createLocalApi } from "../lib/shipmentsApi.js";

const inventory = [{ id: "1", name: "Gauze", category: "Wound Care & Bandages", quantity: 10, unit_value: 2 }];

describe("sheet-mode shipments in localStorage", () => {
  // Newer Node ships a global localStorage that shadows jsdom's (same stub as app-smoke).
  beforeEach(() => {
    const m = new Map();
    vi.stubGlobal("localStorage", { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saves writes and reads them back in a new session", async () => {
    const api = createLocalApi(() => inventory);
    const created = await api.create({ name: "Clinic A", lines: [{ item_id: "1", quantity: 4 }] });
    expect(JSON.parse(window.localStorage.getItem(LOCAL_SHIPMENTS_KEY))).toHaveLength(1);

    const again = createLocalApi(() => inventory);
    const [shipment] = await again.list("all");
    expect(shipment.id).toBe(created.id);
    expect(shipment.lines[0]).toMatchObject({ item_id: "1", quantity: 4, available: 6 });
  });

  it("shipping does not take stock from the sheet's numbers", async () => {
    const api = createLocalApi(() => inventory);
    const { id } = await api.create({ name: "Clinic B", lines: [{ item_id: "1", quantity: 3 }] });
    await api.patch(id, { stage: "pulling" });
    await api.patch(id, { stage: "consolidated" });
    await api.patch(id, { stage: "shipped" });
    const { id: next } = await api.create({ name: "Clinic C", lines: [{ item_id: "1", quantity: 10 }] });
    expect((await api.get(next)).lines[0].on_hand).toBe(10);
  });

  it("copies the old dashboard's shipments in once the inventory is loaded, keeping item ids", async () => {
    window.localStorage.setItem(LEGACY_SHIPMENTS_KEY, JSON.stringify([
      { id: "old-1", recipientName: "Clinic Old", items: [{ id: "1", name: "Gauze", requestedQuantity: 2 }] },
    ]));
    let items = [];
    const api = createLocalApi(() => items);
    expect(await api.list("all")).toEqual([]);
    items = inventory;
    const [shipment] = await api.list("all");
    expect(shipment).toMatchObject({ id: "old-1", name: "Clinic Old", stage: "planned" });
    expect(shipment.lines[0]).toMatchObject({ item_id: "1", quantity: 2 });
    expect(window.localStorage.getItem(LEGACY_SHIPMENTS_KEY)).not.toBeNull();
  });
});

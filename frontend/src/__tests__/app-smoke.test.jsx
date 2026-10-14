import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App.jsx";

// Synthetic rows only: never put real inventory rows in tests (they can carry patient IDs).
const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const item = (id, o = {}) => ({
  id, name: `Synthetic supply ${id}`, gen_name: `Generic ${id}`, manufacturer: "Acme", category: "Gloves",
  quantity: 10, unit_value: 2, total_value: 20, expiration_date: iso(200), warehouse_date: iso(-40),
  days_in_warehouse: 40, pallet_number: 1, category_box: "ER", box_number: 3, review_status: "Approved",
  image_url: null, ...o,
});
const ITEMS = [
  item("s1"),
  item("s2", { expiration_date: iso(-5), pallet_number: 2, category: "IV Supplies" }),
  item("s3", { expiration_date: iso(20), box_number: 4, category: "Airway & Oxygen" }),
  item("s4", { expiration_date: null, unit_value: null, total_value: null }),
];
const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
};

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("localStorage", memoryStorage()); // newer Node ships a global localStorage that shadows jsdom's
  vi.stubGlobal("fetch", vi.fn((url) => {
    if (String(url).endsWith("/items")) return json(ITEMS);
    if (String(url).endsWith("/kpis")) return json({});
    return json([]);
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App shell", () => {
  it("renders every tab without throwing", async () => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/Loading dashboard data/)).toBeNull());
    for (const label of ["Total Inventory", "Inventory KPIs", "Stock Alerts", "Requests", "Shipments", "Shipment KPIs"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(screen.getByRole("button", { name: label }).className).toContain("active");
    }
  });
});

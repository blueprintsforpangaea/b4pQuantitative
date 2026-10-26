import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  item("g1", { name: "Nitrile exam gloves M", expiration_date: iso(200) }),
  item("g2", { name: "Nitrile exam gloves L", expiration_date: iso(20) }),
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

describe("Total Inventory", () => {
  async function open() {
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/Loading dashboard data/)).toBeNull());
  }

  it("collapses size variants into one product row that expands to its lots", async () => {
    await open();
    expect(screen.getAllByText("Nitrile exam gloves")).toHaveLength(1);
    expect(screen.queryByText("Nitrile exam gloves M")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Nitrile exam gloves/ }));
    expect(screen.getByText("Nitrile exam gloves M")).toBeTruthy();
    expect(screen.getByText("Nitrile exam gloves L")).toBeTruthy();
  });

  it("filters from the top search, the category chips and the expiry legend", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Search inventory"), { target: { value: "nitrile" } });
    expect(screen.queryByText("Synthetic supply s1")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search inventory"), { target: { value: "" } });

    fireEvent.click(within(screen.getByRole("group", { name: "Filter by category" })).getByRole("button", { name: /IV Supplies/ }));
    expect(screen.getByText("Synthetic supply s2")).toBeTruthy();
    expect(screen.queryByText("Synthetic supply s1")).toBeNull();
    fireEvent.click(within(screen.getByRole("group", { name: "Filter by category" })).getByRole("button", { name: /^All/ }));

    fireEvent.click(within(screen.getByRole("group", { name: "Filter by expiry" })).getByRole("button", { name: /No expiry date/ }));
    expect(screen.getByText("Synthetic supply s4")).toBeTruthy();
    expect(screen.queryByText("Synthetic supply s1")).toBeNull();
  });

  it("shows availability as a label on the row, not as filter toggles", async () => {
    await open();
    expect(screen.queryByText("Show Available Items")).toBeNull();
    expect(screen.getAllByText("Available").length).toBeGreaterThan(0);
  });
});

describe("Total Inventory partial pulls", () => {
  it("shows the pulled and available lines for a partly pulled lot", async () => {
    fetch.mockImplementation((url) => {
      if (String(url).endsWith("/items")) return json(ITEMS);
      if (String(url).endsWith("/kpis")) return json({});
      if (String(url).endsWith("/allocations")) {
        return json([{ item_id: "s1", shipment_id: "sh1", shipment_name: "Synthetic run", stage: "pulling", quantity: 4 }]);
      }
      return json([]);
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Pulled/, { selector: "strong" })).toBeTruthy());
    expect(screen.getByText(/4 units/)).toBeTruthy();
    expect(screen.getByText(/Synthetic run/)).toBeTruthy();
    expect(screen.getByText(/6 units/)).toBeTruthy(); // 10 on hand - 4 pulled
  });
});

describe("Inventory KPIs", () => {
  async function openKpis() {
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/Loading dashboard data/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Inventory KPIs" }));
  }

  it("shows four question tiles and no pallet map or removed metrics", async () => {
    await openKpis();
    for (const question of ["How much do we have?", "What needs pulling now?", "What should ship next?", "How much is already moving?"]) {
      expect(screen.getByText(question)).toBeTruthy();
    }
    expect(screen.queryByText(/Box Count/i)).toBeNull();
    expect(screen.queryByText(/Avg Boxes per Pallet/i)).toBeNull();
    expect(screen.queryByText(/pallet map/i)).toBeNull();
  });

  it("switches the breakdown and opens a bar in Total Inventory", async () => {
    await openKpis();
    fireEvent.click(screen.getByRole("button", { name: "Category" }));
    fireEvent.click(screen.getByRole("button", { name: "Ring" }));
    fireEvent.click(screen.getByRole("button", { name: "Bars" }));
    const rows = screen.getAllByRole("list")[0];
    fireEvent.click(within(rows).getByRole("button", { name: /IV Supplies/ }));
    expect(screen.getByRole("button", { name: "Total Inventory" }).className).toContain("active");
    expect(screen.getByText("Synthetic supply s2")).toBeTruthy();
    expect(screen.queryByText("Synthetic supply s1")).toBeNull();
  });

  it("lets the pallet panel pick a pallet and defaults to the latest", async () => {
    await openKpis();
    expect(screen.getByRole("combobox").value).toBe("2");
  });
});

describe("Partial pulls without a shipment name", () => {
  it("drops the arrow when /allocations has no shipment_name", async () => {
    fetch.mockImplementation((url) => {
      if (String(url).endsWith("/items")) return json(ITEMS);
      if (String(url).endsWith("/kpis")) return json({});
      if (String(url).endsWith("/allocations")) {
        return json([{ item_id: "s1", shipment_id: "sh1", stage: "pulling", quantity: 4 }]);
      }
      return json([]);
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Pulled/, { selector: "strong" })).toBeTruthy());
    expect(screen.getByText(/4 units/).textContent).not.toContain("→");
  });
});

describe("Add selected to shipment", () => {
  it("opens the add-items dialog with the selected supply", async () => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/Loading dashboard data/)).toBeNull());
    fireEvent.click(screen.getByLabelText("Select supply s1"));
    fireEvent.click(screen.getByRole("button", { name: /Add Selected To Shipment/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Synthetic supply s1/)).toBeTruthy();
  });
});

describe("Shipments feed the dashboard without hiding stock", () => {
  const today = new Date().toISOString().slice(0, 10);
  const shipped = (over) => ({ id: "SHP-1", name: "Synthetic clinic", recipient: "Synthetic clinic", shipment_type: "Local", shipping_method: "Car", blueprints_contact: "Alex Example",
    stage: "shipped", ship_date: today, delivered_date: null, request_ids: [], kind: "inventory", unit_count: null, value: null, notes: "",
    created_at: `${today}T10:00:00Z`, updated_at: `${today}T10:00:00Z`, lines: [], totals: { line_count: 0, units: 0, value: 0 }, ...over });

  function serve(shipments) {
    vi.stubGlobal("fetch", vi.fn((url) => {
      const path = String(url);
      if (path.endsWith("/items")) return json(ITEMS);
      if (path.endsWith("/kpis")) return json({});
      if (path.includes("/shipments")) return json(shipments);
      return json([]);
    }));
  }

  it("keeps a partly shipped item in inventory with its remaining quantity", async () => {
    serve([shipped({ lines: [{ id: "1", item_id: "s1", quantity: 3, picked: true, consolidated: true, name: "Synthetic supply s1", unit_price: 2 }], totals: { line_count: 1, units: 3, value: 6 } })]);
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/Loading dashboard data/)).toBeNull());
    await waitFor(() => expect(globalThis.fetch.mock.calls.some(([url]) => String(url).includes("/shipments"))).toBe(true));
    expect(screen.getByText("Synthetic supply s1")).toBeTruthy();
    expect(screen.getByText("Synthetic supply s2")).toBeTruthy();
  });

  it("counts a non-inventory shipment's unit_count in Units shipped", async () => {
    serve([shipped({ id: "SHP-NI-1", kind: "non_inventory", name: "Donated chairs", unit_count: 4, value: 80, totals: { line_count: 0, units: 4, value: 80 } })]);
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/Loading dashboard data/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Shipment KPIs" }));
    const month = await screen.findByText("This month vs last month");
    const rows = within(month.closest(".shipment-compare-block")).getAllByRole("row");
    const units = rows.find((row) => within(row).queryByText("Units shipped"));
    await waitFor(() => expect(within(units).getAllByRole("cell")[0].textContent).toBe("4"));
    const value = rows.find((row) => within(row).queryByText("Value shipped"));
    expect(within(value).getAllByRole("cell")[0].textContent).toBe("$80.00");
    expect(within(value).getAllByRole("cell")[1].textContent).toBe("$0.00");
  });
});

describe("Total Inventory allocation status", () => {
  it("keeps a partly pulled lot selectable and disables a fully pulled one", async () => {
    fetch.mockImplementation((url) => {
      if (String(url).endsWith("/items")) return json(ITEMS);
      if (String(url).endsWith("/kpis")) return json({});
      if (String(url).endsWith("/allocations")) {
        return json([
          { item_id: "s1", stage: "pulling", quantity: 4 },
          { item_id: "s2", stage: "planned", quantity: 10 },
          { item_id: "s3", stage: "consolidated", quantity: 10 },
        ]);
      }
      return json([]);
    });
    render(<App />);
    await waitFor(() => expect(screen.getAllByText("4 pulled").length).toBeGreaterThan(0));
    expect(screen.getByLabelText("Select supply s1").disabled).toBe(false);
    expect(screen.getAllByText("All 10 pulled").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Consolidated", { selector: ".tag" }).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Select supply s2")).toBeNull();
    expect(screen.getByLabelText(/Supply s2 is fully pulled/)).toBeTruthy();
    expect(screen.queryAllByText("Pulled", { selector: ".tag" })).toHaveLength(0); // no legacy "Pulled" tag on a lot with stock left
  });
});

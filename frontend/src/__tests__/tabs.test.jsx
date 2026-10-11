import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import StockAlerts, { money } from "../StockAlerts.jsx";
import Requests from "../Requests.jsx";
import SyncCell, { ago } from "../SyncCell.jsx";

const json = (body, status = 200, headers = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }));

const row = (o = {}) => ({ id: "1", name: "Gauze", category: "Gloves", quantity: 4, expiration_date: "2026-01-01", days_left: -5,
  total_value: 0, unit_value: 0, pallet_number: 1, category_box: "ER", box_number: 2, ...o });
const summary = (o = {}) => ({ entries: 0, units: 0, value: 0, priced: 0, ...o });
const alerts = (o = {}) => ({ soon_days: 90, low_stock: 1, expired: [], expiring_soon: [], low_stock_items: [],
  summary: { expired: summary(), expiring_soon: summary(), low_stock: summary() }, ...o });

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("money", () => {
  it("says Price unknown only when there is no unit price", () => {
    expect(money(0, 0)).toBe("Price unknown");
    expect(money(0, null)).toBe("Price unknown");
    expect(money(0, 2.5)).toBe("$0.00"); // zero quantity but priced
    expect(money(10, 2.5)).toBe("$10.00");
  });
});

describe("ago", () => {
  it("formats minutes, hours and days", () => {
    const at = (ms) => new Date(Date.now() - ms).toISOString();
    expect(ago(at(30 * 1000))).toBe("just now");
    expect(ago(at(30 * 60000))).toBe("30 min ago");
    expect(ago(at(24 * 3600000))).toBe("24 hours ago");
    expect(ago(at(72 * 3600000))).toBe("3 days ago");
  });
});

describe("StockAlerts", () => {
  it("shows loading, then data with column headers and Price unknown", async () => {
    fetch.mockReturnValue(json(alerts({
      expired: [row()],
      summary: { expired: summary({ entries: 1, units: 4 }), expiring_soon: summary(), low_stock: summary() },
    })));
    render(<StockAlerts />);
    expect(screen.getByRole("status").textContent).toMatch(/Loading/);
    expect(await screen.findByText("Gauze")).toBeTruthy();
    expect(screen.getAllByRole("columnheader", { name: "Supply" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Price unknown").length).toBeGreaterThan(0);
  });

  it("shows empty messages when nothing needs attention", async () => {
    fetch.mockReturnValue(json(alerts()));
    render(<StockAlerts />);
    expect(await screen.findByText("Nothing has expired.")).toBeTruthy();
    expect(screen.getByText("No items are this low.")).toBeTruthy();
  });

  it("announces a 503 as an alert", async () => {
    fetch.mockReturnValue(json({ detail: "x" }, 503));
    render(<StockAlerts />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/database is unavailable/);
  });

  it("keeps the panel when a CSV download fails", async () => {
    fetch.mockImplementation((url) => (String(url).includes(".csv") ? json({}, 503) : json(alerts({ expired: [row()], summary: { expired: summary({ entries: 1 }), expiring_soon: summary(), low_stock: summary() } }))));
    render(<StockAlerts />);
    await screen.findByText("Gauze");
    fireEvent.click(screen.getByRole("button", { name: /Download expiring CSV/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/unavailable/);
    expect(screen.getByText("Gauze")).toBeTruthy();
  });
});

describe("Requests", () => {
  const data = { statuses: ["Under Review", "Approved", "Shipped", "Delivered", "Cancelled", "Denied"], requests: [
    { request_id: "REQ-1", org_name: "Clinic", org_email: "c@example.org", status: "Under Review", timestamp: "2026-05-01T00:00:00Z", review_flag: false, items: [{ item_name: "Gauze", category: "", quantity: 2 }] },
    { request_id: "REQ-2", org_name: "Other", org_email: "", status: "Delivered", timestamp: "2026-04-01T00:00:00Z", review_flag: false, items: [{ item_name: "Tape", category: "", quantity: 1 }] },
  ] };

  it("asks for the admin token first, with a labelled field", () => {
    render(<Requests />);
    expect(screen.getByLabelText("Admin token")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lists open requests and offers only valid next statuses", async () => {
    sessionStorage.setItem("b4p-admin-token", "t");
    fetch.mockReturnValue(json(data));
    render(<Requests />);
    expect(await screen.findByText("REQ-1")).toBeTruthy();
    expect(screen.queryByText("REQ-2")).toBeNull(); // delivered is hidden by the default Open filter
    const select = screen.getByLabelText("Change status of REQ-1");
    expect([...select.options].map((o) => o.text)).toEqual(["Choose…", "Approved", "Denied", "Cancelled"]);
    expect(screen.getAllByRole("columnheader").length).toBe(7);
    expect(fetch.mock.calls[0][1].headers["X-Admin-Token"]).toBe("t");
  });

  it("shows a non-blocking over-commit warning with the right wording per status", async () => {
    sessionStorage.setItem("b4p-admin-token", "t");
    const withWarnings = { ...data, requests: [
      { ...data.requests[0], warnings: [{ item_name: "Gauze", committed: 12, in_stock: 8 }] },
      { ...data.requests[0], request_id: "REQ-3", status: "Approved", warnings: [{ item_name: "Tape", committed: 9, in_stock: 8 }] },
    ] };
    fetch.mockReturnValue(json(withWarnings));
    render(<Requests />);
    expect(await screen.findByText("Approving this would commit 12 of 8 in stock: Gauze")).toBeTruthy();
    expect(screen.getByText("Approved requests commit 9 of 8 in stock: Tape")).toBeTruthy();
    expect(screen.getByLabelText("Change status of REQ-1").disabled).toBe(false); // display only, never blocks
  });

  it("shows a neutral note, not a shortage, for names that match no inventory item", async () => {
    sessionStorage.setItem("b4p-admin-token", "t");
    fetch.mockReturnValue(json({ ...data, requests: [{ ...data.requests[0], warnings: [], unmatched: ["Gauzze"] }] }));
    render(<Requests />);
    expect(await screen.findByText("Not matched to any inventory item; check the name: Gauzze")).toBeTruthy();
    expect(screen.queryByText(/would commit/)).toBeNull();
  });

  it("labels approximate-match warnings and lists tied candidates", async () => {
    sessionStorage.setItem("b4p-admin-token", "t");
    fetch.mockReturnValue(json({ ...data, requests: [{ ...data.requests[0],
      warnings: [{ item_name: "Gauze 4x4 sterile pack", committed: 12, in_stock: 8, match: "approximate" }],
      candidates: [{ item_name: "Tape", names: ["Tape roll", "Tape strip"] }] }] }));
    render(<Requests />);
    expect(await screen.findByText("Approving this would commit 12 of 8 in stock (approximate match): Gauze 4x4 sterile pack")).toBeTruthy();
    expect(screen.getByText("Could be several inventory items; check the name: Tape (Tape roll; Tape strip)")).toBeTruthy();
  });

  it("shows an empty state for a filter with no requests", async () => {
    sessionStorage.setItem("b4p-admin-token", "t");
    fetch.mockReturnValue(json({ ...data, requests: [] }));
    render(<Requests />);
    expect(await screen.findByText("No requests match this filter.")).toBeTruthy();
  });

  it("clears a rejected token and says so", async () => {
    sessionStorage.setItem("b4p-admin-token", "bad");
    fetch.mockReturnValue(json({}, 401));
    render(<Requests />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/not accepted/);
    expect(sessionStorage.getItem("b4p-admin-token")).toBeNull();
  });

  it("formats 422 validation errors and moves focus to the result message", async () => {
    sessionStorage.setItem("b4p-admin-token", "t");
    fetch.mockImplementation((url, opts) => (opts?.method === "POST" ? json({ detail: [{ msg: "String too long" }, { msg: "Bad value" }] }, 422) : json(data)));
    render(<Requests />);
    await screen.findByText("REQ-1");
    fireEvent.change(screen.getByLabelText("Change status of REQ-1"), { target: { value: "Approved" } });
    const note = await screen.findByText(/Could not update REQ-1/);
    expect(note.textContent).toBe("Could not update REQ-1: String too long; Bad value");
    await waitFor(() => expect(document.activeElement).toBe(note));
  });
});

describe("SyncCell", () => {
  const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();

  it("falls back to Sheet pulled in sheet mode and when the endpoint fails", async () => {
    fetch.mockReturnValue(json({ source: "sheet" }));
    render(<SyncCell fallbackLabel="02:55 AM" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByText("Sheet pulled")).toBeTruthy();
    cleanup();
    fetch.mockReturnValue(json({}, 503));
    render(<SyncCell fallbackLabel="02:55 AM" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByText("02:55 AM")).toBeTruthy();
  });

  it("shows the last successful sync", async () => {
    fetch.mockReturnValue(json({ source: "postgres", last_success_at: hoursAgo(3), last_run_ok: true }));
    render(<SyncCell fallbackLabel="x" />);
    expect(await screen.findByText("3 hours ago")).toBeTruthy();
    expect(screen.getByText("Last synced")).toBeTruthy();
  });

  it("says the latest attempt failed while still showing the last success", async () => {
    fetch.mockReturnValue(json({ source: "postgres", last_success_at: hoursAgo(24), last_run_ok: false }));
    render(<SyncCell fallbackLabel="x" />);
    expect(await screen.findByText("Last successful sync 24 hours ago; latest attempt failed")).toBeTruthy();
  });

  it("shows Never when nothing has synced", async () => {
    fetch.mockReturnValue(json({ source: "postgres", last_success_at: null, last_run_ok: null }));
    render(<SyncCell fallbackLabel="x" />);
    expect(await screen.findByText("Never")).toBeTruthy();
  });
});

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Shipments from "../tabs/Shipments.jsx";
import { createMockApi } from "../lib/shipmentsApi.js";
import { useShipments } from "../lib/useShipments.js";

const inventory = [
  { id: "a1", name: "Test gloves M", category: "Gloves", quantity: 10, unit_value: 2, expiration_date: "2020-01-01", lot_number: "L1", pallet_number: 3, category_box: "Gloves", box_number: 7 },
  { id: "a2", name: "Test gloves M", category: "Gloves", quantity: 4, unit_value: 2, expiration_date: null, lot_number: "L2", pallet_number: 5, category_box: "Gloves", box_number: 2 },
];

function Harness({ api }) {
  const state = useShipments({ items: inventory, api });
  return <Shipments items={inventory} state={state} />;
}

beforeEach(() => {
  sessionStorage.setItem("b4p-admin-token", "local-test");
  window.print = vi.fn();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

async function seededApi() {
  const api = createMockApi(inventory);
  await api.create({
    name: "Test Clinic", recipient: "Test Clinic", blueprints_contact: "Alex Example", shipping_method: "Boat", request_ids: ["REQ-TEST-1"],
    lines: [{ item_id: "a1", quantity: 3 }, { item_id: "a2", quantity: 2 }],
  });
  return api;
}

describe("Shipments tab", () => {
  it("shows the step tracker, request ids and per-line location/expiry", async () => {
    render(<Harness api={await seededApi()} />);
    const head = await screen.findByRole("button", { name: /Test Clinic/ });
    expect(screen.getByLabelText(/Shipment progress: Planned/)).toBeTruthy();
    fireEvent.click(head);
    expect(screen.getByDisplayValue("Alex Example")).toBeTruthy();
    expect(screen.getByText("REQ-TEST-1")).toBeTruthy();
    expect(screen.getByText("Pallet 3 / Gloves #7")).toBeTruthy();
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByText("10 on hand, 7 more available")).toBeTruthy();
  });

  it("advances the stage when lines are ticked off", async () => {
    render(<Harness api={await seededApi()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Test Clinic/ }));
    const [pulledFirst, pulledSecond] = screen.getAllByLabelText("Pulled: Test gloves M");
    fireEvent.click(pulledFirst);
    await waitFor(() => expect(screen.getByLabelText(/Shipment progress: Pulling/)).toBeTruthy());
    fireEvent.click(pulledSecond);
    const [consolidatedFirst, consolidatedSecond] = screen.getAllByLabelText("Consolidated: Test gloves M");
    fireEvent.click(consolidatedFirst);
    fireEvent.click(consolidatedSecond);
    await waitFor(() => expect(screen.getByLabelText(/Shipment progress: Consolidated/)).toBeTruthy());
  });

  it("rejects a quantity above what is available without calling the server", async () => {
    const api = await seededApi();
    const spy = vi.spyOn(api, "putLines");
    render(<Harness api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: /Test Clinic/ }));
    const [first] = screen.getAllByLabelText("Quantity of Test gloves M");
    fireEvent.change(first, { target: { value: "99" } });
    fireEvent.blur(first);
    expect(await screen.findByText(/Only \d+ available/)).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it("prints a report for a shipment", async () => {
    render(<Harness api={await seededApi()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Test Clinic/ }));
    fireEvent.click(screen.getByRole("button", { name: /Print/ }));
    await waitFor(() => expect(window.print).toHaveBeenCalled());
    const report = document.querySelector(".shipment-print");
    expect(within(report).getByText(/Shipment report: Test Clinic/)).toBeTruthy();
    expect(within(report).getByText("REQ-TEST-1")).toBeTruthy();
    expect(within(report).getByText("Boat")).toBeTruthy();
  });

  it("asks before shipping and then moves the shipment to Past", async () => {
    render(<Harness api={await seededApi()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Test Clinic/ }));
    fireEvent.click(screen.getByRole("button", { name: /Mark pulling/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Mark consolidated/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Mark shipped/ }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm: removes stock/ }));
    expect(await screen.findByText("No active shipments. Create one, or add items from Total Inventory.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Past/ }));
    expect(await screen.findByRole("button", { name: /Test Clinic/ })).toBeTruthy();
  });

  it("binds every header field to its own data and saves each to the right key", async () => {
    const api = await seededApi();
    const patch = vi.spyOn(api, "patch");
    render(<Harness api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: /Test Clinic/ }));

    expect(screen.getByLabelText("Blueprints contact").value).toBe("Alex Example");
    expect(screen.getByLabelText("Shipping method").value).toBe("Boat");
    expect(screen.getByLabelText("Recipient").value).toBe("Test Clinic");
    expect(screen.getByLabelText("Request ID(s), comma separated").value).toBe("REQ-TEST-1");
    expect(screen.getByLabelText("Ship date").value).toBe("");
    expect(screen.getByLabelText("Notes").value).toBe("");

    const edit = async (label, value, expected) => {
      const input = screen.getByLabelText(label);
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      await waitFor(() => expect(patch).toHaveBeenLastCalledWith(expect.any(String), expected));
    };
    await edit("Blueprints contact", "Sam Example", { blueprints_contact: "Sam Example" });
    await edit("Recipient", "Test Clinic B", { recipient: "Test Clinic B" });
    await edit("Request ID(s), comma separated", "REQ-A, REQ-B", { request_ids: ["REQ-A", "REQ-B"] });
    await edit("Ship date", "2026-11-01", { ship_date: "2026-11-01" });
    await edit("Notes", "Fragile", { notes: "Fragile" });
    fireEvent.change(screen.getByLabelText("Shipping method"), { target: { value: "Plane" } });
    await waitFor(() => expect(patch).toHaveBeenLastCalledWith(expect.any(String), { shipping_method: "Plane" }));
    expect((await api.list("all"))[0]).toMatchObject({ blueprints_contact: "Sam Example", recipient: "Test Clinic B", request_ids: ["REQ-A", "REQ-B"], shipping_method: "Plane", notes: "Fragile" });
  });

  it("offers Other with free text for an unlisted shipping method", async () => {
    const api = createMockApi(inventory);
    await api.create({ name: "Freight run", shipping_method: "Pallet freight", lines: [] });
    render(<Harness api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: /Freight run/ }));
    expect(screen.getByLabelText("Shipping method").value).toBe("Other");
    expect(screen.getByLabelText("Other shipping method").value).toBe("Pallet freight");
  });

  it("labels expiry with the shared inventory tiers", async () => {
    render(<Harness api={await seededApi()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Test Clinic/ }));
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByText("No expiry date")).toBeTruthy();
  });

  it("prints the correct organisation name", async () => {
    render(<Harness api={await seededApi()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Test Clinic/ }));
    fireEvent.click(screen.getByRole("button", { name: /Print/ }));
    await waitFor(() => expect(document.querySelector(".shipment-print")).toBeTruthy());
    expect(document.querySelector(".shipment-print").textContent).toContain("Blueprints for Pangaea");
  });

  it("retries only the ship step when recording a non-inventory shipment fails midway", async () => {
    const api = createMockApi(inventory);
    const realPatch = api.patch;
    let failOnce = true;
    api.patch = async (...args) => {
      if (failOnce) {
        failOnce = false;
        throw Object.assign(new Error("network blip"), { status: 0 });
      }
      return realPatch(...args);
    };
    const create = vi.spyOn(api, "create");
    render(<Harness api={api} />);
    await screen.findByText(/No active shipments/);
    fireEvent.click(screen.getByRole("button", { name: "Record non-inventory" }));
    const field = (label) => screen.getByText(label).closest("label").querySelector("input");
    fireEvent.change(field("Clinic or recipient"), { target: { value: "Test Clinic Z" } });
    fireEvent.change(field("Value (USD)"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Record shipment" }));
    expect(await screen.findByText("network blip")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Record shipment" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(create).toHaveBeenCalledTimes(1);
    expect(await api.list("all")).toHaveLength(1);
  });
});

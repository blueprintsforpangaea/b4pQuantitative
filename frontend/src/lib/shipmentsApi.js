import { API_BASE } from "./config.js";
import { ACTIVE_STAGES, STAGES, shipmentTotals } from "./shipmentsLogic.js";

export const ADMIN_TOKEN_KEY = "b4p-admin-token";

export class ApiError extends Error {
  constructor(status, message, body = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function readAdminToken() {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function saveAdminToken(token) {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    // session storage unavailable; the token only lives in memory for this page
  }
}

async function request(method, path, body) {
  const headers = { "X-Admin-Token": readAdminToken() };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Could not reach the dashboard server.");
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload?.detail ?? payload;
    const message = (typeof detail === "string" ? detail : detail?.error || payload?.error) || `Request failed (${response.status}).`;
    throw new ApiError(response.status, message, typeof detail === "object" && detail ? detail : {});
  }
  return payload;
}

export const realApi = {
  list: (scope = "all") => request("GET", `/shipments?scope=${scope}`),
  get: (id) => request("GET", `/shipments/${encodeURIComponent(id)}`),
  create: (body) => request("POST", "/shipments", body),
  patch: (id, body) => request("PATCH", `/shipments/${encodeURIComponent(id)}`, body),
  putLines: (id, lines) => request("PUT", `/shipments/${encodeURIComponent(id)}/lines`, lines),
  patchLine: (id, lineId, flags) => request("PATCH", `/shipments/${encodeURIComponent(id)}/lines/${encodeURIComponent(lineId)}`, flags),
  importOld: (body) => request("POST", "/shipments/import", body),
};

const today = () => new Date().toISOString().slice(0, 10);

function expiryStatus(expiration, asOf) {
  if (!expiration) return "none";
  const days = Math.round((Date.parse(expiration) - Date.parse(asOf)) / 86400000);
  if (days < 0) return "expired";
  if (days <= 30) return "d30";
  if (days <= 90) return "d90";
  return "later";
}

// In-memory implementation of the same contract, for development and tests before the API lands.
// `inventory` is a list of {id, name, category, quantity, unit_value, expiration_date, lot_number,
// pallet_number, category_box, box_number}; it is copied so shipping can take stock.
export function createMockApi(inventorySource = [], seed = []) {
  const stock = new Map();
  // Items may load after the API is created; copy new ones in on every call.
  const syncStock = () => {
    const inventory = typeof inventorySource === "function" ? inventorySource() : inventorySource;
    for (const item of inventory) {
      if (!stock.has(String(item.id))) stock.set(String(item.id), { ...item });
    }
  };
  syncStock();
  const shipments = new Map(seed.map((shipment) => [shipment.id, structuredClone(shipment)]));
  let counter = 100;

  const allocatedActive = (itemId, exceptShipmentId = null) =>
    [...shipments.values()]
      .filter((s) => ACTIVE_STAGES.includes(s.stage) && s.id !== exceptShipmentId)
      .flatMap((s) => s.lines)
      .filter((l) => String(l.item_id) === String(itemId))
      .reduce((sum, l) => sum + l.quantity, 0);

  const decorate = (shipment) => {
    const asOf = shipment.ship_date || today();
    const lines = shipment.lines.map((line) => {
      if (line.item_id === null || line.item_id === undefined) {
        return { ...line, category: null, pallet_number: null, category_box: null, box_number: null, on_hand: null, allocated_active: null, available: null, max_quantity: null, expiry_status: expiryStatus(line.expiration_date, asOf) };
      }
      const item = stock.get(String(line.item_id));
      const onHand = item ? item.quantity : 0;
      const allocated = allocatedActive(line.item_id);
      const available = onHand - allocated;
      return {
        ...line,
        name: item?.name ?? line.name,
        category: item?.category ?? null,
        lot_number: item?.lot_number ?? line.lot_number ?? null,
        expiration_date: item?.expiration_date ?? line.expiration_date ?? null,
        pallet_number: item?.pallet_number ?? 0,
        category_box: item?.category_box ?? "Unassigned",
        box_number: item?.box_number ?? 0,
        unit_price: line.unit_price ?? item?.unit_value ?? 0,
        on_hand: onHand,
        allocated_active: allocated,
        available,
        max_quantity: Math.max(line.quantity + available, 0),
        expiry_status: expiryStatus(item?.expiration_date ?? line.expiration_date, asOf),
      };
    });
    const out = { ...shipment, lines };
    out.totals = shipmentTotals(out);
    return structuredClone(out);
  };

  const checkAllocation = (shipmentId, itemId, quantity) => {
    const item = stock.get(String(itemId));
    if (!item) throw new ApiError(404, `unknown item ${itemId}`);
    const others = allocatedActive(itemId, shipmentId);
    const available = item.quantity - others;
    if (quantity > available) {
      throw new ApiError(409, `only ${available} available of "${item.name}" (item ${itemId})`, { error: `only ${available} available of "${item.name}" (item ${itemId})`, item_id: String(itemId), requested: quantity, available });
    }
  };

  const buildLines = (shipmentId, lines, existing = []) =>
    lines.map((input) => {
      if (input.item_id === null || input.item_id === undefined) {
        return { id: String(++counter), item_id: null, quantity: input.quantity, picked: false, consolidated: false, name: input.description || input.name || "Item", unit_price: input.unit_price ?? 0, lot_number: input.lot_number ?? null, expiration_date: input.expiration_date ?? null };
      }
      if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new ApiError(400, "quantity must be a whole number of at least 1");
      checkAllocation(shipmentId, input.item_id, input.quantity);
      const prior = existing.find((l) => String(l.item_id) === String(input.item_id));
      return {
        id: prior?.id ?? String(++counter),
        item_id: String(input.item_id),
        quantity: input.quantity,
        picked: input.picked ?? prior?.picked ?? false,
        consolidated: input.consolidated ?? prior?.consolidated ?? false,
        name: stock.get(String(input.item_id))?.name ?? "Item",
        unit_price: input.unit_price ?? prior?.unit_price,
      };
    });

  const need = (id) => {
    const shipment = shipments.get(id);
    if (!shipment) throw new ApiError(404, `unknown shipment ${id}`);
    return shipment;
  };

  const moveStage = (shipment, target) => {
    if (!STAGES.includes(target)) throw new ApiError(400, `invalid stage ${target}`);
    const from = STAGES.indexOf(shipment.stage);
    const to = STAGES.indexOf(target);
    if (to < from && !(ACTIVE_STAGES.includes(shipment.stage) && ACTIVE_STAGES.includes(target))) {
      throw new ApiError(409, `cannot change shipment ${shipment.id} from ${shipment.stage} to ${target}`);
    }
    if (target === "shipped" && ACTIVE_STAGES.includes(shipment.stage)) {
      for (const line of shipment.lines) {
        if (line.item_id === null) continue;
        checkAllocation(shipment.id, line.item_id, line.quantity);
        stock.get(String(line.item_id)).quantity -= line.quantity;
      }
      shipment.ship_date = shipment.ship_date || today();
    }
    if (target === "delivered") shipment.delivered_date = shipment.delivered_date || today();
    shipment.stage = target;
  };

  const HEADER_KEYS = ["name", "recipient", "shipment_type", "shipping_method", "blueprints_contact", "notes", "ship_date", "delivered_date", "request_ids", "kind", "unit_count", "value"];

  const api = {
    list: async (scope = "all") =>
      [...shipments.values()]
        .filter((s) => scope === "all" || (scope === "active") === ACTIVE_STAGES.includes(s.stage))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(decorate),
    get: async (id) => decorate(need(id)),
    create: async (body) => {
      if (!body.name) throw new ApiError(400, "name is required");
      const id = body.id || `SHP-${Math.floor(Date.now() / 1000)}-${String(++counter).padStart(3, "0")}`;
      const shipment = { id, stage: "planned", request_ids: [], kind: "inventory", ship_date: null, delivered_date: null, notes: "", recipient: "", shipment_type: "Local", shipping_method: "", blueprints_contact: "", unit_count: null, value: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), lines: [] };
      for (const key of HEADER_KEYS) if (body[key] !== undefined) shipment[key] = body[key];
      shipment.lines = buildLines(id, body.lines || []);
      if (body.kind === "non_inventory") shipment.stage = "shipped";
      shipments.set(id, shipment);
      return decorate(shipment);
    },
    patch: async (id, body) => {
      const shipment = need(id);
      for (const key of HEADER_KEYS) if (body[key] !== undefined) shipment[key] = body[key];
      if (body.stage && body.stage !== shipment.stage) moveStage(shipment, body.stage);
      shipment.updated_at = new Date().toISOString();
      return decorate(shipment);
    },
    putLines: async (id, lines) => {
      const shipment = need(id);
      if (!ACTIVE_STAGES.includes(shipment.stage)) throw new ApiError(409, `shipment ${id} is ${shipment.stage}; its lines are frozen`);
      shipment.lines = buildLines(id, lines, shipment.lines);
      return decorate(shipment);
    },
    patchLine: async (id, lineId, flags) => {
      const shipment = need(id);
      const line = shipment.lines.find((l) => l.id === String(lineId));
      if (!line) throw new ApiError(404, `unknown line ${lineId}`);
      if (flags.picked !== undefined) line.picked = flags.picked;
      if (flags.consolidated !== undefined) line.consolidated = flags.consolidated;
      return decorate(shipment);
    },
    importOld: async (body) => {
      const result = { created: 0, skipped: 0, errors: [] };
      for (const old of [...(body.shipments || []), ...(body.non_inventory || [])]) {
        if (shipments.has(old.id)) {
          result.skipped += 1;
          continue;
        }
        try {
          const isNon = old.clinicName !== undefined;
          await realOrMockCreate(old, isNon);
          result.created += 1;
        } catch (err) {
          result.errors.push({ id: old.id, reason: err.message });
        }
      }
      return result;
    },
  };
  const synced = Object.fromEntries(Object.entries(api).map(([name, fn]) => [name, (...args) => { syncStock(); return fn(...args); }]));

  return synced;

  async function realOrMockCreate(old, isNon) {
    if (isNon) {
      shipments.set(old.id, { id: old.id, name: old.clinicName, recipient: old.clinicName, shipment_type: old.shipmentType, shipping_method: "", blueprints_contact: old.pointOfContact, notes: "", stage: "shipped", ship_date: old.shippedAt, delivered_date: null, request_ids: [], kind: "non_inventory", unit_count: null, value: old.valuation, created_at: old.createdAt || new Date().toISOString(), updated_at: new Date().toISOString(), lines: [] });
      return;
    }
    // Raw old localStorage shipment (same field mapping the real API applies).
    const items = old.items || [];
    const stage = old.isCompleted
      ? (old.pastShipmentStatus === "Delivered" ? "delivered" : "shipped")
      : items.length > 0 && items.every((item) => item.isConsolidated) ? "consolidated" : items.some((item) => item.isConsolidated) ? "pulling" : "planned";
    shipments.set(old.id, {
      id: old.id, name: old.recipientName || "Untitled shipment", recipient: old.recipientName || "", shipment_type: old.shipmentType === "National" ? "International" : old.shipmentType || "",
      shipping_method: old.transportType || "", blueprints_contact: old.pointOfContact || "", notes: old.notes || "", stage, ship_date: old.shipmentDate || null,
      delivered_date: old.deliveryDate || null, request_ids: [], kind: "inventory", unit_count: null, value: null, created_at: old.createdAt || new Date().toISOString(), updated_at: new Date().toISOString(),
      lines: items.map((item) => {
        const known = item.id !== undefined && stock.has(String(item.id));
        return { id: String(++counter), item_id: known ? String(item.id) : null, quantity: Number(item.requestedQuantity) || Number(item.quantity) || 1, picked: Boolean(item.isConsolidated), consolidated: Boolean(item.isConsolidated), name: item.name || "Item", unit_price: Number(item.unitPrice) || 0, lot_number: item.lotNumber || null, expiration_date: item.expirationDate || null };
      }),
    });
  }
}

let mockSingleton = null;
let currentInventoryGetter = () => [];

// Real API unless VITE_SHIPMENTS_MOCK=1 (dev only; data is synthetic and lives in memory).
export function getShipmentsApi(getInventory) {
  if (import.meta.env.VITE_SHIPMENTS_MOCK === "1") {
    // Always read through the latest getter (React may discard the first render's closure).
    currentInventoryGetter = getInventory;
    mockSingleton = mockSingleton || createMockApi(() => currentInventoryGetter(), []);
    return mockSingleton;
  }
  return realApi;
}

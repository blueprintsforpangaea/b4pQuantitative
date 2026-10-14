// Pure helpers for the API-backed Shipments tab (contract: Blueprints_DB docs/CONTRACT.md, "Ops shipments").

export const STAGES = ["planned", "pulling", "consolidated", "shipped", "delivered"];
export const ACTIVE_STAGES = ["planned", "pulling", "consolidated"];

export const STAGE_LABELS = {
  planned: "Planned",
  pulling: "Pulling",
  consolidated: "Consolidated",
  shipped: "Shipped",
  delivered: "Delivered",
};

export const EXPIRY_LABELS = {
  expired: "Expired",
  d30: "Expires within 30 days",
  d90: "Expires in 31-90 days",
  later: "Expires after 90 days",
  none: "No expiry date",
};

export const EXPIRY_SHORT = { expired: "Expired", d30: "30d", d90: "90d", later: "90d+", none: "No date" };

export const SHIPPING_METHODS = ["Car", "Boat", "Plane", "Other"];

// A stored method outside the list is shown as Other with its text kept.
export function splitShippingMethod(value) {
  const text = String(value || "");
  if (!text) return { choice: "", other: "" };
  if (SHIPPING_METHODS.includes(text) && text !== "Other") return { choice: text, other: "" };
  return { choice: "Other", other: text === "Other" ? "" : text };
}

export function isActive(shipment) {
  return ACTIVE_STAGES.includes(shipment.stage);
}

export function stageIndex(stage) {
  return Math.max(0, STAGES.indexOf(stage));
}

// The stage a shipment should be in from its check-off flags, only while active.
// Any pulled line -> pulling; every line consolidated -> consolidated; otherwise planned.
export function stageFromLines(lines) {
  const stocked = lines.filter((line) => line.item_id !== null && line.item_id !== undefined);
  if (stocked.length === 0) {
    return "planned";
  }
  if (stocked.every((line) => line.consolidated)) {
    return "consolidated";
  }
  if (stocked.some((line) => line.picked || line.consolidated)) {
    return "pulling";
  }
  return "planned";
}

// Stage to PATCH after a tick, or null if the stage should stay as it is.
export function autoStageAfterTick(shipment, lines) {
  if (!isActive(shipment)) {
    return null;
  }
  const target = stageFromLines(lines);
  return target === shipment.stage ? null : target;
}

export function nextStage(stage) {
  const index = STAGES.indexOf(stage);
  return index >= 0 && index < STAGES.length - 1 ? STAGES[index + 1] : null;
}

export function previousActiveStage(stage) {
  const index = ACTIVE_STAGES.indexOf(stage);
  return index > 0 ? ACTIVE_STAGES[index - 1] : null;
}

// "Pallet 3 / Gloves box 12" or "No location" for free-text lines.
export function formatLocation(line) {
  if (line.item_id === null || line.item_id === undefined || line.pallet_number === null || line.pallet_number === undefined) {
    return "No location";
  }
  const pallet = line.pallet_number ? `Pallet ${line.pallet_number}` : "Pallet unassigned";
  const box = line.category_box && line.category_box !== "Unassigned" ? line.category_box : "box unassigned";
  return `${pallet} / ${box}${line.box_number ? ` #${line.box_number}` : ""}`;
}

// Product name = text before any " - " / size token is ux-a's job on the inventory tab; here
// lines for the same product name sit together and each lot/location stays its own line.
export function groupLinesByProduct(lines) {
  const groups = new Map();
  for (const line of lines) {
    const key = (line.name || "Unnamed").trim().toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { name: line.name || "Unnamed", lines: [] });
    }
    groups.get(key).lines.push(line);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      lines: [...group.lines].sort(
        (a, b) =>
          (a.expiration_date || "9999").localeCompare(b.expiration_date || "9999") ||
          String(a.lot_number || "").localeCompare(String(b.lot_number || ""))
      ),
      units: group.lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Quantity edit check against the line's max_quantity (null = free-text line, unlimited).
export function validateQuantity(value, line) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return "Enter a whole number of at least 1.";
  }
  if (quantity > 999999) {
    return "Quantity is too large.";
  }
  if (line.max_quantity !== null && line.max_quantity !== undefined && quantity > line.max_quantity) {
    return `Only ${line.max_quantity} available for this line.`;
  }
  return "";
}

export function lineValue(line) {
  return (Number(line.quantity) || 0) * (Number(line.unit_price) || 0);
}

export function shipmentTotals(shipment) {
  if (shipment.totals) {
    return shipment.totals;
  }
  const lines = shipment.lines || [];
  const hasLines = lines.length > 0;
  return {
    line_count: lines.length,
    units: hasLines ? lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0) : Number(shipment.unit_count) || 0,
    value: hasLines ? lines.reduce((sum, l) => sum + lineValue(l), 0) : Number(shipment.value) || 0,
  };
}

// Request IDs typed or pasted, separated by commas/whitespace/newlines.
export function parseRequestIds(text) {
  return [...new Set(String(text || "").split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean))].slice(0, 50);
}

export function normalizeShipmentType(value) {
  return value === "National" ? "International" : value || "Local";
}

// Old localStorage shipments -> body for POST /shipments/import. The API maps the old field names
// itself, so the raw objects are sent; only empty never-used drafts are left out.
export function buildImportBody(oldShipments, oldNonInventory) {
  const list = (value) => (Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") : []);
  return {
    shipments: list(oldShipments).filter((shipment) => (shipment.items || []).length > 0 || shipment.isCompleted),
    non_inventory: list(oldNonInventory),
  };
}

// Newest first: active by creation time, past by ship date.
export function sortShipments(shipments) {
  const key = (shipment) => (isActive(shipment) ? shipment.created_at || "" : `${shipment.ship_date || (shipment.created_at || "").slice(0, 10)}|${shipment.created_at || ""}`);
  return [...shipments].sort((a, b) => key(b).localeCompare(key(a)));
}

// API shipments -> the shapes the older KPI / inventory-status code expects.
export function toLegacyShipments(apiShipments) {
  const inventory = apiShipments.filter((shipment) => shipment.kind !== "non_inventory");
  const legacy = inventory.map((shipment) => {
    const done = !isActive(shipment);
    return {
      id: shipment.id,
      recipientName: shipment.name,
      shipmentType: normalizeShipmentType(shipment.shipment_type),
      pointOfContact: shipment.blueprints_contact || "",
      createdAt: (shipment.created_at || "").slice(0, 10),
      shippedAt: shipment.ship_date || "",
      deliveryDate: shipment.delivered_date || "",
      isCompleted: done,
      pastShipmentStatus: done ? (shipment.stage === "delivered" ? "Delivered" : "Shipped") : undefined,
      pastShipmentStatusOverride: done ? (shipment.stage === "delivered" ? "Delivered" : "Shipped") : "",
      consolidationStartedAt: "",
      consolidationCompletedAt: shipment.stage === "consolidated" || done ? (shipment.ship_date || "") : "",
      items: (shipment.lines || []).map((line) => ({
        id: line.item_id ?? `line-${line.id}`,
        name: line.name,
        quantity: line.quantity,
        requestedQuantity: line.quantity,
        unitPrice: Number(line.unit_price) || 0,
        isConsolidated: Boolean(line.consolidated),
      })),
    };
  });
  const nonInventory = apiShipments
    .filter((shipment) => shipment.kind === "non_inventory")
    .map((shipment) => ({
      id: shipment.id,
      clinicName: shipment.recipient || shipment.name,
      pointOfContact: shipment.blueprints_contact || "",
      shipmentType: normalizeShipmentType(shipment.shipment_type),
      shippedAt: shipment.ship_date || (shipment.created_at || "").slice(0, 10),
      valuation: Number(shipment.value) || 0,
      unitCount: Number(shipment.unit_count) || 0,
      createdAt: (shipment.created_at || "").slice(0, 10),
    }));
  return { shipments: legacy, nonInventoryShipments: nonInventory };
}

export function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

// Client-side expiry tier for inventory rows (same tiers as the API's expiry_status).
export function expiryTier(expirationDate, asOf = new Date().toISOString().slice(0, 10)) {
  if (!expirationDate) return "none";
  const days = Math.round((Date.parse(expirationDate) - Date.parse(asOf)) / 86400000);
  if (days < 0) return "expired";
  if (days <= 30) return "d30";
  if (days <= 90) return "d90";
  return "later";
}

// Units of each inventory item promised to active shipments: Map<item_id, units>.
export function allocatedByItem(shipments) {
  const map = new Map();
  for (const shipment of shipments) {
    if (!isActive(shipment)) continue;
    for (const line of shipment.lines || []) {
      if (line.item_id === null || line.item_id === undefined) continue;
      map.set(String(line.item_id), (map.get(String(line.item_id)) || 0) + line.quantity);
    }
  }
  return map;
}

// Full replacement list for PUT /shipments/{id}/lines with one item added (or its quantity raised).
export function linesWithItemAdded(lines, itemId, quantity) {
  const kept = lines.map((line) =>
    line.item_id === null || line.item_id === undefined
      ? { description: line.name, quantity: line.quantity, unit_price: line.unit_price, lot_number: line.lot_number, expiration_date: line.expiration_date }
      : { item_id: String(line.item_id), quantity: line.quantity }
  );
  const existing = kept.find((line) => String(line.item_id) === String(itemId));
  if (existing) {
    existing.quantity += quantity;
  } else {
    kept.push({ item_id: String(itemId), quantity });
  }
  return kept;
}

export function linesWithQuantity(lines, lineId, quantity) {
  return lines.map((line) => {
    const base = line.item_id === null || line.item_id === undefined
      ? { description: line.name, quantity: line.quantity, unit_price: line.unit_price, lot_number: line.lot_number, expiration_date: line.expiration_date }
      : { item_id: String(line.item_id), quantity: line.quantity };
    return line.id === lineId ? { ...base, quantity } : base;
  });
}

export function linesWithout(lines, lineId) {
  return linesWithQuantity(lines, null, 0).filter((_, index) => lines[index].id !== lineId);
}

import { daysUntil, durationBucket, expirationBucket, expirationStatus } from "./dates.js";
import { formatExpiration } from "./format.js";

export function buildInventoryRows(items) {
  return items.map((item) => ({
    id: item.id,
    supplyId: item.id,
    quantity: item.quantity || 0,
    unitPrice: item.unit_value || 0,
    palletSortValue: Number(item.pallet_number) || 0,
    palletNumber: item.pallet_number ? String(item.pallet_number) : "Unassigned",
    boxType: item.category_box || "Unassigned",
    boxNumber: Number(item.box_number) || 0,
    daysInWarehouse: item.days_in_warehouse ?? 0,
    generalSupply: item.gen_name || "Unspecified",
    exactSupplyName: item.name || "Unnamed supply",
    manufacturer: item.manufacturer || "Unknown",
    category: item.category || "Uncategorized",
    reviewStatus: item.review_status || "",
    needsReview: (item.review_status || "").trim().toLowerCase() === "review needed",
    imageUrl: /^https?:\/\//i.test(item.image_url || "") ? item.image_url : "",
    locationInfo: `Pallet ${item.pallet_number || "N/A"} - ${item.category_box || "Unassigned"} #${item.box_number || "N/A"}`,
    expirationDate: formatExpiration(item.expiration_date),
    expirationRaw: item.expiration_date || null,
    expirationDaysLeft: daysUntil(item.expiration_date || null),
    expirationStatus: expirationStatus(daysUntil(item.expiration_date || null)),
    warehouseDate: item.warehouse_date || null,
    expiryTier: expiryTierId(daysUntil(item.expiration_date || null)),
    expirationFilter: expirationBucket(item.expiration_date || null),
    durationFilter: durationBucket(item.warehouse_date || null),
    valuation: item.total_value || 0,
  }));
}

export function compareItemsByLocation(left, right) {
  const palletDiff = (left.palletSortValue || 0) - (right.palletSortValue || 0);
  if (palletDiff !== 0) {
    return palletDiff;
  }

  const boxTypeDiff = (left.boxType || "").localeCompare(right.boxType || "");
  if (boxTypeDiff !== 0) {
    return boxTypeDiff;
  }

  const boxNumberDiff = (left.boxNumber || 0) - (right.boxNumber || 0);
  if (boxNumberDiff !== 0) {
    return boxNumberDiff;
  }

  return String(left.supplyId || "").localeCompare(String(right.supplyId || ""));
}

export function sortItemsByLocation(items) {
  return [...items].sort(compareItemsByLocation);
}

export function sortItemsByExpiration(items) {
  return [...items].sort((left, right) => {
    const leftDays = left.expirationDaysLeft;
    const rightDays = right.expirationDaysLeft;

    if (leftDays === null && rightDays !== null) {
      return 1;
    }
    if (leftDays !== null && rightDays === null) {
      return -1;
    }
    if (leftDays !== null && rightDays !== null && leftDays !== rightDays) {
      return leftDays - rightDays;
    }

    return compareItemsByLocation(left, right);
  });
}

// Legacy, localStorage-era status. Only App.jsx still calls it; Total Inventory and Inventory KPIs
// derive status from allocations (applyAllocations) instead.
export function inventoryStatusForItem(itemId, shipments) {
  const isPulled = shipments
    .filter((shipment) => !shipment.isCompleted)
    .some((shipment) =>
    shipment.items.some((shipmentItem) => String(shipmentItem.id) === String(itemId))
  );

  return isPulled ? "Pulled" : "Available";
}

// Splits each lot's units by what the shipment allocations say. available = on hand - allocated;
// consolidated units are the allocations whose shipment is in the consolidated stage.
export function applyAllocations(rows, byItem) {
  return rows.map((row) => {
    const quantity = row.quantity || 0;
    const entry = byItem?.get(String(row.id));
    const stageUnits = (entry?.shipments || []).reduce(
      (totals, allocation) => {
        const units = Number(allocation.quantity) || 0;
        if (allocation.stage === "consolidated") {
          totals.consolidated += units;
        } else {
          totals.pulled += units;
        }
        return totals;
      },
      { pulled: 0, consolidated: 0 }
    );
    const consolidatedUnits = Math.min(stageUnits.consolidated, quantity);
    const pulledUnits = Math.min(stageUnits.pulled, quantity - consolidatedUnits);
    const allocatedUnits = pulledUnits + consolidatedUnits;
    const availableUnits = quantity - allocatedUnits;
    const workflowStatuses = [
      ...(availableUnits > 0 || quantity === 0 ? ["Inventory"] : []),
      ...(pulledUnits > 0 ? ["Pulled"] : []),
      ...(consolidatedUnits > 0 ? ["Consolidated"] : []),
    ];
    const fullyAllocated = quantity > 0 && availableUnits === 0;

    return {
      ...row,
      pulledUnits,
      consolidatedUnits,
      allocatedUnits,
      availableUnits,
      workflowStatuses,
      inventoryStatus: !fullyAllocated ? "Available" : consolidatedUnits === allocatedUnits ? "Consolidated" : "Pulled",
      supplyWorkflowStatus: workflowStatuses[0] || "Inventory",
    };
  });
}

// The status tags for one lot or a group of lots (rows already passed through applyAllocations):
//   some stock left   -> "Available", plus "N pulled" when part is allocated
//   nothing left      -> one tag, "Consolidated" (every allocation consolidated) or "All N pulled"
export function allocationTags(rows) {
  const allocated = rows.reduce((total, row) => total + (row.allocatedUnits || 0), 0);
  const consolidated = rows.reduce((total, row) => total + (row.consolidatedUnits || 0), 0);
  const hasStock = rows.some((row) => (row.availableUnits ?? row.quantity ?? 0) > 0);

  if (hasStock) {
    return allocated > 0
      ? [{ label: "Available", tone: "available" }, { label: `${allocated.toLocaleString()} pulled`, tone: "partial" }]
      : [{ label: "Available", tone: "available" }];
  }
  if (allocated > 0 && consolidated === allocated) {
    return [{ label: "Consolidated", tone: "consolidated" }];
  }
  return allocated > 0
    ? [{ label: `All ${allocated.toLocaleString()} pulled`, tone: "pulled" }]
    : [{ label: "Available", tone: "available" }];
}

export function buildFacetCounts(rows, key, preferredOrder = []) {
  const counts = rows.reduce((accumulator, row) => {
    const value = row[key];
    accumulator[value] = (accumulator[value] || 0) + 1;
    return accumulator;
  }, {});

  const remaining = Object.keys(counts)
    .filter((value) => !preferredOrder.includes(value))
    .sort((a, b) => a.localeCompare(b));

  return [...preferredOrder, ...remaining].map((value) => ({
    value,
    count: counts[value] || 0,
  }));
}

export function valueBucketForUnitPrice(unitPrice) {
  const numericValue = Number(unitPrice) || 0;
  if (numericValue < 50) {
    return "$0-$50";
  }
  if (numericValue < 100) {
    return "$50-$100";
  }
  if (numericValue < 200) {
    return "$100-$200";
  }
  return "$200+";
}

// ---- Product grouping -------------------------------------------------------

const SIZE_WORDS = "xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|small|medium|large|x-?large|extra[ -]?large|x-?small|extra[ -]?small";
const NUM = "\\d+(?:\\.\\d+)?";
const UNIT = "(?:mm|cm|in|inch|ml|cc|l|oz|g|mg|fr|french|ga|cm2|\"|')";
// A trailing size: a size word, a number with optional unit or gauge (7.5, 18G, 10 mL),
// or a dimension (4x4, 4"x4", 2 x 3 in), optionally prefixed by "size" and separated by , - / or (...).
const TRAILING_SIZE = new RegExp(
  "(?:[\\s,/]+|\\s*[\\-\\u2013]\\s+|\\s*\\()" +
    "(?:size\\s+)?(?:" +
    `${NUM}\\s*${UNIT}?\\s*[x\u00d7]\\s*${NUM}\\s*${UNIT}?(?:\\s*[x\u00d7]\\s*${NUM}\\s*${UNIT}?)?` +
    `|${NUM}\\s*${UNIT}?` +
    `|(?:${SIZE_WORDS})` +
    ")\\)?\\s*$",
  "i"
);

// "Nitrile exam gloves M" -> "Nitrile exam gloves". Never returns an empty string:
// if the whole name is a size token the name is kept as is.
export function productName(name) {
  let result = String(name || "").trim();
  for (let guard = 0; guard < 4; guard += 1) {
    const next = result.replace(TRAILING_SIZE, "").replace(/[\s,\-\u2013/]+$/, "").trim();
    if (!next || next === result) {
      break;
    }
    result = next;
  }
  return result || String(name || "").trim();
}

export function productKey(name) {
  return productName(name).toLowerCase().replace(/\s+/g, " ");
}

// Groups lot rows under their product, sorted alphabetically. Each group carries
// the totals the collapsed row needs.
export function groupByProduct(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = productKey(row.exactSupplyName);
    if (!groups.has(key)) {
      groups.set(key, { key, name: productName(row.exactSupplyName), category: row.category, rows: [] });
    }
    groups.get(key).rows.push(row);
  }

  return [...groups.values()]
    .map((group) => {
      const dated = group.rows.map((row) => row.expirationDaysLeft).filter((days) => days !== null);
      return {
        ...group,
        rows: sortItemsByExpiration(group.rows),
        totalQuantity: group.rows.reduce((total, row) => total + (row.quantity || 0), 0),
        totalValue: group.rows.reduce((total, row) => total + (row.valuation || 0), 0),
        soonestDaysLeft: dated.length ? Math.min(...dated) : null,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function expiryTierId(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) {
    return "none";
  }
  if (daysLeft <= 0) {
    return "expired";
  }
  if (daysLeft <= 30) {
    return "d30";
  }
  if (daysLeft <= 90) {
    return "d90";
  }
  return "ok";
}

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

export function inventoryStatusForItem(itemId, shipments) {
  const isPulled = shipments
    .filter((shipment) => !shipment.isCompleted)
    .some((shipment) =>
    shipment.items.some((shipmentItem) => String(shipmentItem.id) === String(itemId))
  );

  return isPulled ? "Pulled" : "Available";
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

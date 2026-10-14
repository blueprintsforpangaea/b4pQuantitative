import { categoryOverflowColor, colorForCategory, durationBucketColors, durationBucketOrder, expiryTiers, supplyStatusColors, supplyStatusOrder } from "./colors.js";

export const BREAKDOWN_DIMS = [
  { id: "expiry", label: "Expiry" },
  { id: "category", label: "Category" },
  { id: "duration", label: "Time in warehouse" },
  { id: "workflow", label: "Workflow status" },
];

export const BREAKDOWN_MEASURES = [
  { id: "units", label: "Units" },
  { id: "value", label: "Value ($)" },
];

export const MAX_CATEGORY_SEGMENTS = 8;

function measureOf(row, measure) {
  return measure === "value" ? Number(row.valuation) || 0 : Number(row.quantity) || 0;
}

function sumBy(rows, measure) {
  return rows.reduce((total, row) => total + measureOf(row, measure), 0);
}

// Rows -> ordered segments for the Inventory KPIs breakdown. Each segment carries the
// Total Inventory filter that reproduces it (type + values), so a click can open those supplies.
export function buildBreakdown(rows, dim, measure = "units") {
  let groups = [];

  if (dim === "expiry") {
    groups = expiryTiers.map((tier) => ({
      id: tier.id, label: tier.label, color: tier.color,
      rows: rows.filter((row) => row.expiryTier === tier.id),
      filter: { type: "tier", values: [tier.id] },
    }));
  } else if (dim === "duration") {
    groups = [...durationBucketOrder, "Unknown duration"].map((label) => ({
      id: label, label, color: durationBucketColors[label],
      rows: rows.filter((row) => row.durationFilter === label),
      filter: { type: "duration", values: [label] },
    }));
  } else if (dim === "workflow") {
    groups = supplyStatusOrder.map((label) => ({
      id: label, label, color: supplyStatusColors[label],
      rows: rows.filter((row) => row.supplyWorkflowStatus === label),
      filter: { type: "workflow", values: [label] },
    }));
  } else if (dim === "category") {
    const byCategory = new Map();
    for (const row of rows) {
      byCategory.set(row.category, [...(byCategory.get(row.category) || []), row]);
    }
    const ranked = [...byCategory.entries()]
      .map(([label, categoryRows]) => ({ label, rows: categoryRows, value: sumBy(categoryRows, measure) }))
      .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
    const shown = ranked.slice(0, MAX_CATEGORY_SEGMENTS);
    const rest = ranked.slice(MAX_CATEGORY_SEGMENTS);
    groups = shown.map((entry) => ({
      id: entry.label, label: entry.label, color: colorForCategory(entry.label),
      rows: entry.rows, filter: { type: "category", values: [entry.label] },
    }));
    if (rest.length > 0) {
      // A 9th hue is never generated: the tail folds into one neutral "Other".
      groups.push({
        id: "__other__", label: `Other (${rest.length})`, color: categoryOverflowColor,
        rows: rest.flatMap((entry) => entry.rows),
        filter: { type: "category", values: rest.map((entry) => entry.label) },
      });
    }
  }

  const segments = groups
    .map((group) => ({ ...group, value: sumBy(group.rows, measure), entries: group.rows.length }))
    .filter((segment) => segment.value > 0);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return {
    total,
    segments: segments.map((segment) => ({
      id: segment.id, label: segment.label, color: segment.color, value: segment.value,
      entries: segment.entries, filter: segment.filter,
      percent: total > 0 ? (segment.value / total) * 100 : 0,
    })),
  };
}

// Headline tiles. Allocations are units already reserved by active shipments, per item.
export function inventoryTiles(rows, allocationsByItem, allocationSummary) {
  const units = (list) => list.reduce((total, row) => total + (row.quantity || 0), 0);
  const expired = rows.filter((row) => row.expiryTier === "expired");
  const expiredUnits = units(expired);
  const needsPulling = expired.reduce((total, row) => {
    const pulled = Math.min(allocationsByItem?.get(String(row.id))?.pulled || 0, row.quantity || 0);
    return total + Math.max(0, (row.quantity || 0) - pulled);
  }, 0);
  const soon = rows.filter((row) => row.expiryTier === "d30" || row.expiryTier === "d90");

  return {
    totalUnits: units(rows),
    totalValue: rows.reduce((total, row) => total + (row.valuation || 0), 0),
    expiredUnits,
    needsPulling,
    expiringUnits: units(soon),
    pulledUnits: allocationSummary?.pulledUnits || 0,
    consolidatedUnits: allocationSummary?.consolidatedUnits || 0,
    movingUnits: (allocationSummary?.pulledUnits || 0) + (allocationSummary?.consolidatedUnits || 0),
  };
}

// Pallet ids sorted numerically where possible; the latest pallet is the highest number.
export function palletIds(rows) {
  const ids = [...new Set(rows.map((row) => row.palletNumber).filter((id) => id && id !== "Unassigned"))];
  return ids.sort((left, right) => {
    const a = Number(left);
    const b = Number(right);
    return !Number.isNaN(a) && !Number.isNaN(b) ? a - b : String(left).localeCompare(String(right));
  });
}

export function latestPallet(rows) {
  const ids = palletIds(rows);
  return ids.length ? ids[ids.length - 1] : "";
}

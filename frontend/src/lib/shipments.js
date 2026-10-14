import { todayIsoDate } from "./dates.js";
import { sortItemsByExpiration, sortItemsByLocation } from "./inventory.js";

export const defaultShipments = [
  {
    id: "shipment-1",
    recipientName: "Shipment A",
    shipmentType: "Local",
    pointOfContact: "",
    filterMode: "original",
    items: [],
  },
  {
    id: "shipment-2",
    recipientName: "Shipment B",
    shipmentType: "Local",
    pointOfContact: "",
    filterMode: "original",
    items: [],
  },
];

export const shipmentTypeOptions = ["Local", "International"];

export const transportTypeOptions = ["Car", "Boat", "Plane", "Other"];

export const blueprintsRosterNames = [
  "Ben Rathi", "James Ha", "Elliane Siebert", "Anurag Bolneni", "Sana Shah",
  "Hadi Juratli", "Grant Veldhuis", "Maya Nassif", "Aakash Gummidela", "Romel Patel",
  "Liya Berry", "Rahul Nanwani", "Katelyn Knickerbocker", "Rohan Kolli", "Belinda Chang",
  "Amy Mui", "Sania Azhar", "Farhan Ibrahim", "Sahran Hassan", "Russell Day", "Mia Zhong",
  "Jia Anand", "Aditya Chada", "Grisham Halapeti", "Timothy Jho", "Aisha Tokovic",
  "Ajan Arora", "Philip Hadiwidjaja", "Jacqueline Suarez", "Lasya Kolli", "Rishi Garigipati",
  "Samaria Noel", "Rajas Visal", "Vishnav Ramesh", "Stacey Liu", "Yug Patel", "LolaRose Song",
  "Anjali Kakarla", "Arnav Akhaury", "Caleb Knickerbocker", "Navya Yerrapu", "Addison Richmond",
  "Ritvik Sampath", "Allison Mack", "Max Hampel", "Devarshi Dalal", "Yusuf Halilovic",
  "Missole Doe", "Divya Balaji", "Lexy Aguirre",
];

export function normalizeShipmentType(value) {
  return value === "National" ? "International" : value || "Local";
}

export function normalizePastShipmentStatus(value, deliveryDate = "", manualOverride = "") {
  if (manualOverride === "Shipped" || (value === "Shipped" && manualOverride === true)) {
    return "Shipped";
  }
  if (manualOverride === "Delivered") {
    return "Delivered";
  }

  const hasScheduledDeliveryDate = /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate);
  return hasScheduledDeliveryDate && deliveryDate <= todayIsoDate()
    ? "Delivered"
    : "Shipped";
}

export function getShipmentStatus(shipment) {
  if (!shipment.items.length) {
    return "Planning";
  }

  const consolidatedCount = shipment.items.filter((item) => item.isConsolidated).length;
  if (consolidatedCount === 0) {
    return "Planning";
  }
  if (consolidatedCount === shipment.items.length) {
    return "Consolidation Complete";
  }
  return "Consolidating";
}

export function normalizeRequestedQuantity(item) {
  const maxQuantity = Number(item.quantity) || 0;
  const requestedQuantity = Number(item.requestedQuantity);

  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
    return maxQuantity;
  }

  return Math.min(requestedQuantity, maxQuantity || requestedQuantity);
}

export function normalizeShipmentItem(item) {
  return {
    ...item,
    requestedQuantity: normalizeRequestedQuantity(item),
  };
}

export function withConsolidationCompletionDate(shipment) {
  const anyConsolidated = shipment.items.some((item) => item.isConsolidated);
  const allConsolidated =
    shipment.items.length > 0 && shipment.items.every((item) => item.isConsolidated);

  if (allConsolidated) {
    return {
      ...shipment,
      consolidationStartedAt: shipment.consolidationStartedAt || todayIsoDate(),
      consolidationCompletedAt: shipment.consolidationCompletedAt || todayIsoDate(),
    };
  }

  return {
    ...shipment,
    consolidationStartedAt: anyConsolidated ? shipment.consolidationStartedAt || todayIsoDate() : "",
    consolidationCompletedAt: "",
  };
}

export function requestedShipmentItemValue(item) {
  return (Number(item.unitPrice) || 0) * normalizeRequestedQuantity(item);
}

export function rankShipmentsBySearch(shipments, normalizedSearch) {
  return [...shipments]
    .map((shipment) => {
      if (!normalizedSearch) {
        return { shipment, score: 0 };
      }

      let score = 0;
      const recipientName = (shipment.recipientName || "").toLowerCase();
      if (recipientName.includes(normalizedSearch)) {
        score += recipientName === normalizedSearch ? 10 : 6;
      }

      shipment.items.forEach((item) => {
        const supplyId = String(item.supplyId || "").toLowerCase();
        const exactSupplyName = (item.exactSupplyName || "").toLowerCase();
        const generalSupply = (item.generalSupply || "").toLowerCase();
        const manufacturer = (item.manufacturer || "").toLowerCase();

        if (supplyId.includes(normalizedSearch)) {
          score += supplyId === normalizedSearch ? 7 : 4;
        }
        if (exactSupplyName.includes(normalizedSearch)) {
          score += exactSupplyName === normalizedSearch ? 5 : 3;
        }
        if (generalSupply.includes(normalizedSearch)) {
          score += 2;
        }
        if (manufacturer.includes(normalizedSearch)) {
          score += 2;
        }
      });

      return { shipment, score };
    })
    .filter(({ score }) => !normalizedSearch || score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.shipment.recipientName.localeCompare(right.shipment.recipientName);
    })
    .map(({ shipment }) => shipment);
}

export function shipmentStatusDateValue(shipment, statusDateFilter) {
  const fieldByFilter = {
    creation: shipment.createdAt,
    consolidation: shipment.consolidationCompletedAt,
    ship: shipment.shippedAt,
    delivery: shipment.deliveryDate,
  };

  const rawValue = fieldByFilter[statusDateFilter];
  if (!rawValue || rawValue === "TBD") {
    return 0;
  }

  const parsedValue = new Date(rawValue).getTime();
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

export function buildDefaultConsolidationState(item) {
  return {
    consolidatedQuantity: normalizeRequestedQuantity(item),
  };
}

export function getShipmentItemsForDisplay(shipment) {
  if ((shipment.filterMode || "original") === "expiration") {
    return sortItemsByExpiration(shipment.items);
  }
  if (shipment.filterMode === "location") {
    return sortItemsByLocation(shipment.items);
  }

  return shipment.items;
}

import { average } from "./format.js";

export function todayIsoDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// A bare "YYYY-MM-DD" is parsed by Date as UTC midnight, which lands on the
// previous calendar day for anyone west of UTC. Every date the dashboard shows
// is a calendar date, so build it in local time instead.
export function parseLocalDate(dateValue) {
  if (!dateValue) {
    return null;
  }

  const isoDateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue).trim());
  const parsed = isoDateParts
    ? new Date(Number(isoDateParts[1]), Number(isoDateParts[2]) - 1, Number(isoDateParts[3]))
    : new Date(dateValue);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

export function daysUntil(dateValue) {
  const target = parseLocalDate(dateValue);
  if (!target) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

export function daysBetweenDates(targetDateValue, referenceDateValue) {
  const referenceDate = parseLocalDate(referenceDateValue);
  const targetDate = parseLocalDate(targetDateValue);

  if (!referenceDate || !targetDate) {
    return null;
  }

  return Math.round((targetDate - referenceDate) / 86400000);
}

export function averageShipmentDays(shipments, startField, endField) {
  const values = shipments
    .map((shipment) => daysBetweenDates(shipment[endField], shipment[startField]))
    .filter((value) => value !== null);

  return average(values);
}

export function expirationStatus(diff) {
  if (diff === null) {
    return {
      label: "No expiration date",
      tone: "none",
    };
  }

  if (diff <= 0) {
    return {
      label: `${Math.abs(diff)} days overdue`,
      tone: "expired",
    };
  }

  if (diff <= 90) {
    return {
      label: `${diff} days left`,
      tone: "urgent",
    };
  }

  if (diff <= 180) {
    return {
      label: `${diff} days left`,
      tone: "warning",
    };
  }

  if (diff <= 365) {
    return {
      label: `${diff} days left`,
      tone: "caution",
    };
  }

  return {
    label: `${diff} days left`,
    tone: "healthy",
  };
}

export function expirationBucket(dateValue) {
  const diff = daysUntil(dateValue);
  if (diff === null) {
    return "No expiration date";
  }
  if (diff <= 0) {
    return "Already expired";
  }
  if (diff <= 90) {
    return "0-90 days";
  }
  if (diff <= 180) {
    return "90-180 days";
  }
  if (diff <= 365) {
    return "180-365 days";
  }
  return "365+ days";
}

export function durationBucket(warehouseDate) {
  const diff = daysUntil(warehouseDate);
  const daysInWarehouse = diff === null ? null : Math.abs(diff);

  if (daysInWarehouse === null) {
    return "Unknown duration";
  }
  if (daysInWarehouse <= 30) {
    return "0-30 days";
  }
  if (daysInWarehouse <= 90) {
    return "31-90 days";
  }
  if (daysInWarehouse <= 180) {
    return "91-180 days";
  }
  if (daysInWarehouse <= 365) {
    return "181-365 days";
  }
  return "365+ days";
}

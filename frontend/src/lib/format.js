export function formatShipmentHistoryDate(value) {
  return value || "Not set";
}

export function formatCurrentShipmentHistoryDate(value) {
  return value || "Not started";
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

export function formatCurrency(value) {
  if (!value) return "Price unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value ?? 0);
}

export function formatExpiration(value) {
  return value || "No expiration date";
}

export function formatAverageDays(value) {
  return `${value.toFixed(1)} days`;
}

export function percentOfTotal(value, total) {
  if (!total) {
    return 0;
  }

  return Math.round((value / total) * 1000) / 10;
}

export function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function formatCompactCurrency(value) {
  if (value >= 1000000000000) {
    const scaled = value / 1000000000000;
    return `$${scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2)}T`;
  }
  if (value >= 1000000000) {
    const scaled = value / 1000000000;
    return `$${scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2)}B`;
  }
  if (value >= 1000000) {
    const scaled = value / 1000000;
    return `$${scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2)}M`;
  }
  if (value >= 1000) {
    return `$${Math.round(value / 1000)}K`;
  }
  return `$${Math.round(value)}`;
}

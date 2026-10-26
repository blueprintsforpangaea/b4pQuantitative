// Pure month-over-month / year-over-year comparison math for the Shipment KPIs tab.
// Entries are { shipmentDate: "YYYY-MM-DD", shipmentValue, shipmentItems }.

export const ON_TRACK_TOLERANCE = 0.05;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function pad(value) {
  return String(value).padStart(2, "0");
}

function iso(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function toIsoDate(date) {
  return iso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function percentChange(current, prior) {
  if (!Number.isFinite(prior) || prior === 0) {
    return null;
  }
  return ((current - prior) / prior) * 100;
}

function sumEntries(entries, startIso, endIso) {
  const totals = { shipments: 0, units: 0, value: 0 };
  for (const entry of entries) {
    const match = ISO_DATE.exec(entry.shipmentDate || "");
    if (!match) {
      continue;
    }
    const date = `${match[1]}-${match[2]}-${match[3]}`;
    if (date < startIso || date > endIso) {
      continue;
    }
    totals.shipments += 1;
    totals.units += Number(entry.shipmentItems) || 0;
    totals.value += Number(entry.shipmentValue) || 0;
  }
  return totals;
}

// Start/end (inclusive) of the current period to date, the same span of the prior
// period, and the full prior period. Feb 29 / month-end days clamp to the prior period.
export function periodRanges(granularity, todayIso) {
  const [year, month, day] = todayIso.split("-").map(Number);

  if (granularity === "year") {
    const priorDay = Math.min(day, daysInMonth(year - 1, month));
    return {
      current: [iso(year, 1, 1), todayIso],
      prior: [iso(year - 1, 1, 1), iso(year - 1, month, priorDay)],
      priorFull: [iso(year - 1, 1, 1), iso(year - 1, 12, 31)],
      elapsedDays: Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1,
      periodDays: (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365,
    };
  }

  const priorYear = month === 1 ? year - 1 : year;
  const priorMonth = month === 1 ? 12 : month - 1;
  const priorLast = daysInMonth(priorYear, priorMonth);
  return {
    current: [iso(year, month, 1), todayIso],
    prior: [iso(priorYear, priorMonth, 1), iso(priorYear, priorMonth, Math.min(day, priorLast))],
    priorFull: [iso(priorYear, priorMonth, 1), iso(priorYear, priorMonth, priorLast)],
    elapsedDays: day,
    periodDays: daysInMonth(year, month),
  };
}

// ahead / on-track / behind compares to-date totals against the same span of the
// prior period. "no-baseline" when the prior span had nothing to compare to.
export function trackStatus(current, prior, tolerance = ON_TRACK_TOLERANCE) {
  if (!(prior > 0)) {
    return current > 0 ? "no-baseline" : "none";
  }
  const ratio = current / prior;
  if (ratio > 1 + tolerance) {
    return "ahead";
  }
  if (ratio < 1 - tolerance) {
    return "behind";
  }
  return "on-track";
}

function compareMetric(current, prior, priorFull, elapsedDays, periodDays) {
  return {
    current,
    prior,
    priorFull,
    change: current - prior,
    pct: percentChange(current, prior),
    projected: elapsedDays > 0 ? (current / elapsedDays) * periodDays : 0,
    status: trackStatus(current, prior),
  };
}

export function comparePeriods(entries, granularity, todayIso) {
  const ranges = periodRanges(granularity, todayIso);
  const current = sumEntries(entries, ...ranges.current);
  const prior = sumEntries(entries, ...ranges.prior);
  const priorFull = sumEntries(entries, ...ranges.priorFull);
  const metric = (key) =>
    compareMetric(current[key], prior[key], priorFull[key], ranges.elapsedDays, ranges.periodDays);

  return {
    granularity,
    ranges,
    shipments: metric("shipments"),
    units: metric("units"),
    value: metric("value"),
  };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function periodLabels(granularity, todayIso) {
  const [year, month] = todayIso.split("-").map(Number);
  if (granularity === "year") {
    return { current: `${year} to date`, prior: `${year - 1} same span` };
  }
  const priorMonth = month === 1 ? 12 : month - 1;
  const priorYear = month === 1 ? year - 1 : year;
  return {
    current: `${MONTH_NAMES[month - 1]} ${year} to date`,
    prior: `${MONTH_NAMES[priorMonth - 1]} ${priorYear} same span`,
  };
}

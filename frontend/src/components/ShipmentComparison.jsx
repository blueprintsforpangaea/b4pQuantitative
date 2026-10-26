import { formatNumber } from "../lib/format.js";
import { formatMoney } from "../lib/shipmentsLogic.js";
import { comparePeriods, periodLabels, toIsoDate } from "../lib/shipmentComparisons.js";

const STATUS_LABELS = {
  ahead: "Ahead",
  "on-track": "On track",
  behind: "Behind",
  "no-baseline": "No baseline",
  none: "No data",
};

function formatChange(pct) {
  if (pct === null) {
    return "n/a";
  }
  const rounded = Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function ComparisonBlock({ title, granularity, entries, todayIso }) {
  const comparison = comparePeriods(entries, granularity, todayIso);
  const labels = periodLabels(granularity, todayIso);
  const rows = [
    { label: "Shipments", data: comparison.shipments, format: formatNumber },
    { label: "Units shipped", data: comparison.units, format: formatNumber },
    // $0.00 when nothing shipped; "Price unknown" only when shipments exist but carry no value.
    { label: "Value shipped", data: comparison.value, format: (value, shipmentCount) => (value === 0 && shipmentCount > 0 ? "Price unknown" : formatMoney(value)) },
  ];

  return (
    <div className="shipment-compare-block">
      <h3>{title}</h3>
      <div className="shipment-compare-scroll">
      <table className="shipment-compare-table">
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col" className="num">{labels.current}</th>
            <th scope="col" className="num">{labels.prior}</th>
            <th scope="col" className="num">Change</th>
            <th scope="col" className="num">Full prior period</th>
            <th scope="col">Pace</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, data, format }) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td className="num">{format(data.current, comparison.shipments.current)}</td>
              <td className="num">{format(data.prior, comparison.shipments.prior)}</td>
              <td className="num">{formatChange(data.pct)}</td>
              <td className="num">{format(data.priorFull, comparison.shipments.priorFull)}</td>
              <td>
                <span className={`compare-tag compare-tag-${data.status}`}>
                  {STATUS_LABELS[data.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export default function ShipmentComparison({ entries, today = new Date() }) {
  const todayIso = toIsoDate(today);

  return (
    <section className="shipment-compare" aria-label="Shipment period comparison">
      <div className="shipment-compare-header">
        <p className="section-label">Are we on track</p>
        <p className="shipment-compare-note">
          Each period to date is compared with the same span of the previous period.
        </p>
      </div>
      <div className="shipment-compare-grid">
        <ComparisonBlock title="This month vs last month" granularity="month" entries={entries} todayIso={todayIso} />
        <ComparisonBlock title="This year vs last year" granularity="year" entries={entries} todayIso={todayIso} />
      </div>
    </section>
  );
}

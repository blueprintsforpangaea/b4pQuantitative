import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// "Price unknown" depends on whether a unit price exists, not on the total (a zero-quantity row is $0 but priced).
const money = (total, priced) =>
  priced ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(total) : "Price unknown";

function dueLabel(days) {
  if (days === null || days === undefined) return "No expiration date";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Expires today";
  return `${days} days left`;
}

function AlertTable({ title, rows, empty, showDays }) {
  const [limit, setLimit] = useState(25);
  return (
    <div className="summary-card" style={{ minWidth: 0 }}>
      <div className="panel-header">
        <div>
          <p className="section-label">{title}</p>
          <h3>{rows.length} {rows.length === 1 ? "entry" : "entries"}</h3>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="empty-state">{empty}</p>
      ) : (
        <div className="shipment-kpi-table-wrap" style={{ overflowX: "auto" }}>
          <table className="shipment-kpi-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Supply</th>
                <th>{showDays ? "Expiration" : "Quantity"}</th>
                <th>{showDays ? "Quantity" : "Expiration"}</th>
                <th>Location</th>
                <th>Valuation</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td title={r.name}>{r.name.length > 48 ? `${r.name.slice(0, 48)}…` : r.name}</td>
                  <td>{showDays ? `${r.expiration_date} (${dueLabel(r.days_left)})` : r.quantity}</td>
                  <td>{showDays ? r.quantity : r.expiration_date ? `${r.expiration_date} (${dueLabel(r.days_left)})` : "No expiration date"}</td>
                  <td>P{r.pallet_number} / {r.category_box} / Box {r.box_number}</td>
                  <td>{money(r.total_value, r.unit_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit ? (
        <button type="button" className="secondary-button" onClick={() => setLimit(limit + 50)}>
          Show more ({rows.length - limit} hidden)
        </button>
      ) : null}
    </div>
  );
}

export default function StockAlerts() {
  const [soonDays, setSoonDays] = useState(90);
  const [lowStock, setLowStock] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetch(`${API_BASE}/stock-alerts?soon_days=${soonDays}&low_stock=${lowStock}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 503 ? "The inventory database is unavailable right now." : "Could not load stock alerts.");
        return r.json();
      })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [soonDays, lowStock]);

  if (error) return <section className="panel error-panel">{error}</section>;
  if (!data) return <section className="panel"><p className="empty-state">Loading stock alerts…</p></section>;
  const s = data.summary;
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="section-label">Stock Alerts</p>
          <h2>Expired, expiring soon and low stock</h2>
        </div>
        <div className="inventory-actions">
          <label>
            Expiring within{" "}
            <select value={soonDays} onChange={(e) => setSoonDays(Number(e.target.value))}>
              {[30, 60, 90, 180, 365].map((n) => <option key={n} value={n}>{n} days</option>)}
            </select>
          </label>
          <label>
            Low stock at or below{" "}
            <select value={lowStock} onChange={(e) => setLowStock(Number(e.target.value))}>
              {[0, 1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n} units</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="metrics-grid metrics-grid-primary">
        <div className="metric-card"><p className="metric-label">Expired</p><p className="metric-value">{s.expired.units.toLocaleString()} units</p><p className="metric-label">{s.expired.entries} entries, {money(s.expired.value, s.expired.priced)}</p></div>
        <div className="metric-card"><p className="metric-label">Expiring in {data.soon_days} days</p><p className="metric-value">{s.expiring_soon.units.toLocaleString()} units</p><p className="metric-label">{s.expiring_soon.entries} entries, {money(s.expiring_soon.value, s.expiring_soon.priced)}</p></div>
        <div className="metric-card"><p className="metric-label">Low stock</p><p className="metric-value">{s.low_stock.entries.toLocaleString()} entries</p><p className="metric-label">{s.low_stock.units.toLocaleString()} units left</p></div>
      </div>
      <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
        <AlertTable title="Expired" rows={data.expired} empty="Nothing has expired." showDays />
        <AlertTable title={`Expiring within ${data.soon_days} days`} rows={data.expiring_soon} empty="Nothing expires in this window." showDays />
        <AlertTable title={`Low stock (${data.low_stock} or fewer)`} rows={data.low_stock_items} empty="No items are this low." />
      </div>
    </section>
  );
}

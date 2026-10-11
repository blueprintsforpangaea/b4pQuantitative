import { useCallback, useEffect, useState } from "react";
import { downloadCsv } from "./download.js";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const TOKEN_KEY = "b4p-admin-token";

// Same forward-only rules as the database's set_request_status().
const NEXT = {
  "Under Review": ["Approved", "Denied", "Cancelled"],
  Approved: ["Shipped", "Delivered", "Denied", "Cancelled"],
  Shipped: ["Delivered"],
  Delivered: [],
  Cancelled: [],
  Denied: [],
};

const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
};

export default function Requests() {
  const [token, setToken] = useState(readToken);
  const [tokenInput, setTokenInput] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("Open");

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await fetch(`${API_BASE}/requests`, { headers: { "X-Admin-Token": token } });
      if (r.status === 401 || r.status === 403) {
        try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
        setToken("");
        setError(r.status === 403 ? "Request management is disabled on this server (ADMIN_TOKEN not set)." : "That admin token was not accepted.");
        return;
      }
      if (!r.ok) throw new Error(r.status === 503 ? "The request database is unavailable right now." : "Could not load requests.");
      setData(await r.json());
    } catch (e) {
      setError(e.message);
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  async function changeStatus(id, status) {
    setNotice("");
    const r = await fetch(`${API_BASE}/requests/${encodeURIComponent(id)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Token": token },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      const detail = (await r.json().catch(() => ({}))).detail;
      // FastAPI sends a string for HTTP errors and a list of {msg} objects for validation errors.
      const text = Array.isArray(detail) ? detail.map((d) => d.msg || String(d)).join("; ") : detail;
      setNotice(`Could not update ${id}: ${text || r.status}`);
    } else {
      setNotice(`${id} is now ${status}.`);
    }
    load();
  }

  if (!token) {
    return (
      <section className="panel">
        <div className="panel-header"><div><p className="section-label">Requests</p><h2>Admin token required</h2></div></div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try { sessionStorage.setItem(TOKEN_KEY, tokenInput.trim()); } catch { /* ignore */ }
            setToken(tokenInput.trim());
            setTokenInput("");
          }}
        >
          <input type="password" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="Admin token" autoComplete="off" />{" "}
          <button type="submit" className="secondary-button" disabled={!tokenInput.trim()}>Unlock requests</button>
        </form>
        {error ? <p className="empty-state">{error}</p> : null}
      </section>
    );
  }
  if (error) return <section className="panel error-panel">{error} <button type="button" className="secondary-button" onClick={load}>Retry</button></section>;
  if (!data) return <section className="panel"><p className="empty-state">Loading requests…</p></section>;

  const isOpen = (s) => s === "Under Review" || s === "Approved";
  const shown = data.requests.filter((r) => filter === "All" || (filter === "Open" ? isOpen(r.status) : r.status === filter));
  const counts = data.statuses.map((s) => [s, data.requests.filter((r) => r.status === s).length]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div><p className="section-label">Requests</p><h2>Partner supply requests</h2></div>
        <label>
          Show{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["Open", "All", ...data.statuses].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <div className="metrics-grid metrics-grid-primary">
        {counts.map(([s, n]) => <div className="metric-card" key={s}><p className="metric-label">{s}</p><p className="metric-value">{n}</p></div>)}
      </div>
      {notice ? <p className="empty-state" role="status">{notice}</p> : null}
      {shown.length === 0 ? <p className="empty-state">No requests match this filter.</p> : (
        <div className="shipment-kpi-table-wrap" style={{ overflowX: "auto", maxHeight: "none" }}>
          <table className="shipment-kpi-table">
            <thead><tr><th>Request</th><th>Organization</th><th>Items</th><th>Submitted</th><th>Status</th><th>Change status</th><th>Packing list</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.request_id}>
                  <td>{r.request_id}{r.review_flag ? " (flagged)" : ""}</td>
                  <td>{r.org_name}<br /><small>{r.org_email || "no email"}</small></td>
                  <td style={{ whiteSpace: "normal", minWidth: "260px" }}>{r.items.map((i) => `${i.quantity} x ${i.item_name}`).join("; ")}</td>
                  <td>{new Date(r.timestamp).toLocaleDateString()}</td>
                  <td>{r.status}</td>
                  <td>
                    {NEXT[r.status]?.length ? (
                      <select value="" onChange={(e) => e.target.value && changeStatus(r.request_id, e.target.value)} aria-label={`Change status of ${r.request_id}`}>
                        <option value="">Choose…</option>
                        {NEXT[r.status].map((s) => <option key={s}>{s}</option>)}
                      </select>
                    ) : "Final"}
                  </td>
                  <td>
                    <button type="button" className="secondary-button" onClick={() => downloadCsv(`/requests/${encodeURIComponent(r.request_id)}/packing-list.csv`, token).catch((e) => setNotice(e.message))}>
                      CSV
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

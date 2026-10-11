import { useCallback, useEffect, useRef, useState } from "react";
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
  const noticeRef = useRef(null);

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
    await load();
    // The changed row may leave the current filter, so land focus on the result message instead.
    noticeRef.current?.focus();
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
          <input type="password" aria-label="Admin token" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="Admin token" autoComplete="off" />{" "}
          <button type="submit" className="secondary-button" disabled={!tokenInput.trim()}>Unlock requests</button>
        </form>
        {error ? <p className="empty-state" role="alert">{error}</p> : null}
      </section>
    );
  }
  if (error) return <section className="panel error-panel" role="alert">{error} <button type="button" className="secondary-button" onClick={load}>Retry</button></section>;
  if (!data) return <section className="panel" role="status" aria-live="polite"><p className="empty-state">Loading requests…</p></section>;

  const isOpen = (s) => s === "Under Review" || s === "Approved";
  const shown = data.requests.filter((r) => filter === "All" || (filter === "Open" ? isOpen(r.status) : r.status === filter));
  const counts = data.statuses.map((s) => [s, data.requests.filter((r) => r.status === s).length]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div><p className="section-label">Requests</p><h2>Partner supply requests</h2></div>
        <label>
          Show{" "}
          <select aria-label="Filter requests by status" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["Open", "All", ...data.statuses].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <div className="metrics-grid metrics-grid-primary">
        {counts.map(([s, n]) => <div className="metric-card" key={s}><p className="metric-label">{s}</p><p className="metric-value">{n}</p></div>)}
      </div>
      {notice ? <p className="empty-state" role="status" aria-live="polite" tabIndex={-1} ref={noticeRef}>{notice}</p> : null}
      {shown.length === 0 ? <p className="empty-state">No requests match this filter.</p> : (
        <div className="shipment-kpi-table-wrap" style={{ overflowX: "auto", maxHeight: "none" }}>
          <table className="shipment-kpi-table requests-table" aria-label="Partner supply requests">
            <thead><tr>{["Request", "Organization", "Items", "Submitted", "Status", "Change status", "Packing list"].map((h) => <th scope="col" key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.request_id}>
                  <th scope="row" data-label="Request" style={{ fontWeight: "inherit", textAlign: "left" }}>{r.request_id}{r.review_flag ? " (flagged)" : ""}</th>
                  <td data-label="Organization">{r.org_name}<br /><small>{r.org_email || "no email"}</small></td>
                  <td data-label="Items" style={{ whiteSpace: "normal", minWidth: "200px" }}>
                    {r.items.map((i) => `${i.quantity} x ${i.item_name}`).join("; ")}
                    {(r.warnings || []).map((w) => (
                      <p key={w.item_name} className="stock-warning" style={{ color: "#8a4b00", margin: "6px 0 0" }}>
                        {r.status === "Approved" ? "Approved requests commit" : "Approving this would commit"} {w.committed} of {w.in_stock} in stock{w.match === "approximate" ? " (approximate match)" : ""}: {w.item_name}
                      </p>
                    ))}
                    {(r.removed || []).map((name) => (
                      <p key={`g-${name}`} className="stock-note" style={{ color: "#6b6b6b", margin: "6px 0 0" }}>
                        No longer in stock (removed from the inventory sheet): {name}
                      </p>
                    ))}
                    {(r.candidates || []).map((c) => (
                      <p key={`c-${c.item_name}`} className="stock-note" style={{ color: "#6b6b6b", margin: "6px 0 0" }}>
                        Could be several inventory items; check the name: {c.item_name} ({c.names.join("; ")})
                      </p>
                    ))}
                    {(r.unmatched || []).map((name) => (
                      <p key={name} className="stock-note" style={{ color: "#6b6b6b", margin: "6px 0 0" }}>
                        Not matched to any inventory item; check the name: {name}
                      </p>
                    ))}
                  </td>
                  <td data-label="Submitted">{new Date(r.timestamp).toLocaleDateString()}</td>
                  <td data-label="Status">{r.status}</td>
                  <td data-label="Change status">
                    {NEXT[r.status]?.length ? (
                      <select value="" onChange={(e) => e.target.value && changeStatus(r.request_id, e.target.value)} aria-label={`Change status of ${r.request_id}`}>
                        <option value="">Choose…</option>
                        {NEXT[r.status].map((s) => <option key={s}>{s}</option>)}
                      </select>
                    ) : "Final"}
                  </td>
                  <td data-label="Packing list">
                    <button type="button" className="secondary-button" aria-label={`Download packing list for ${r.request_id}`} onClick={() => downloadCsv(`/requests/${encodeURIComponent(r.request_id)}/packing-list.csv`, token).catch((e) => setNotice(e.message))}>
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

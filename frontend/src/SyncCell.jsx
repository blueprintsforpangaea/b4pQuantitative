import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function ago(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 120) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`;
}

// Title-block cell: "Last synced" from the database when it is the source, else the old "Sheet pulled" time.
export default function SyncCell({ fallbackLabel }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/sync-status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setStatus(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status || status.source !== "postgres") {
    return (
      <div className="title-block-cell">
        <p className="title-block-label">Sheet pulled</p>
        <p className="title-block-value">{fallbackLabel}</p>
      </div>
    );
  }
  const when = status.last_success_at;
  const stale = status.last_run_ok === false;
  return (
    <div className="title-block-cell" title={when ? `Last successful sync: ${new Date(when).toLocaleString()}` : "The inventory has never synced"}>
      <p className="title-block-label">Last synced</p>
      <p className="title-block-value">{when ? ago(when) : "Never"}</p>
      {stale ? <p className="title-block-label">Latest sync did not complete</p> : null}
    </div>
  );
}

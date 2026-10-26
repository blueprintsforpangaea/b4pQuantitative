import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export function ago(iso) {
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
  const failed = status.last_run_ok === false;
  const exact = when ? new Date(when).toLocaleString() : "never";
  // Always the last SUCCESSFUL sync; a failed latest attempt is said out loud.
  const text = !when ? "Never" : failed ? `Last successful sync ${ago(when)}; latest attempt failed` : ago(when);
  return (
    <div className="title-block-cell sync-cell" title={`Last successful sync: ${exact}`}>
      <p className="title-block-label">{failed || !when ? "Sync status" : "Last synced"}</p>
      <p className="title-block-value">{text}</p>
    </div>
  );
}

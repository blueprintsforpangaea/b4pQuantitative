import { useEffect, useState } from "react";
import { API_BASE } from "./config.js";

// Which data source the server reads: "sheet" (no DATABASE_URL) or "postgres"; null until /sync-status answers.
// Anything other than an explicit "sheet" counts as "postgres", so database errors still show.
export function useDataSource() {
  const [source, setSource] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/sync-status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setSource(d?.source === "sheet" ? "sheet" : "postgres"))
      .catch(() => !cancelled && setSource("postgres"));
    return () => {
      cancelled = true;
    };
  }, []);

  return source;
}

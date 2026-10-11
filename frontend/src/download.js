const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// Fetch a CSV (optionally with the admin token) and hand it to the browser as a file download.
export async function downloadCsv(path, token) {
  const r = await fetch(`${API_BASE}${path}`, token ? { headers: { "X-Admin-Token": token } } : {});
  if (!r.ok) throw new Error(r.status === 404 ? "Nothing to export." : r.status === 503 ? "The database is unavailable right now." : "Download failed.");
  const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || "export.csv";
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

import { useState } from "react";
import { saveAdminToken } from "../lib/shipmentsApi.js";
import { buildImportBody } from "../lib/shipmentsLogic.js";

const IMPORTED_FLAG = "blueprints-shipments-imported";

function readJson(key) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readLegacyShipments() {
  try {
    if (window.localStorage.getItem(IMPORTED_FLAG)) return null;
  } catch {
    return null;
  }
  const body = buildImportBody(readJson("blueprints-current-shipments"), readJson("blueprints-non-inventory-shipments"));
  return body.shipments.length + body.non_inventory.length > 0 ? body : null;
}

// One-time import of shipments that only lived in this browser's localStorage. Old keys are kept.
export function LegacyImportBanner({ canEdit, onImport }) {
  const [body] = useState(readLegacyShipments);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!body) return null;

  const total = body.shipments.length + body.non_inventory.length;

  async function run() {
    setBusy(true);
    const outcome = await onImport(body);
    setBusy(false);
    if (!outcome.ok) {
      setReport({ error: outcome.error });
      return;
    }
    setReport(outcome.result);
    if (outcome.result.errors.length === 0) {
      try {
        window.localStorage.setItem(IMPORTED_FLAG, new Date().toISOString());
      } catch {
        // flag could not be saved; the import is idempotent so running it again is safe
      }
    }
  }

  return (
    <div className="ship-banner" role="region" aria-label="Import earlier shipments">
      <p>
        <strong>{total} shipment(s)</strong> from earlier versions are stored only in this browser. Import them into the shared database; nothing is deleted from this browser.
      </p>
      <button type="button" className="primary-button" disabled={!canEdit || busy || (report && !report.error && report.errors?.length === 0)} onClick={run}>
        {busy ? "Importing..." : "Import now"}
      </button>
      {!canEdit ? <span className="ship-hint">Enter the admin token first.</span> : null}
      {report?.error ? <p className="ship-error" role="alert">{report.error}</p> : null}
      {report && !report.error ? (
        <p role="status">Imported {report.created}, already present {report.skipped}, not imported {report.errors.length}.
          {report.errors.map((entry) => <span key={entry.id} className="ship-error"> {entry.id}: {entry.reason}</span>)}
        </p>
      ) : null}
    </div>
  );
}

export function UnlockBar({ canEdit, onUnlock }) {
  const [token, setToken] = useState("");
  if (canEdit) return null;
  return (
    <form className="ship-banner" onSubmit={(event) => { event.preventDefault(); if (token.trim()) { saveAdminToken(token.trim()); onUnlock(); } }}>
      <label className="ship-field ship-field-inline">
        <span>Admin token to edit shipments</span>
        <input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" />
      </label>
      <button type="submit" className="secondary-button" disabled={!token.trim()}>Unlock editing</button>
    </form>
  );
}

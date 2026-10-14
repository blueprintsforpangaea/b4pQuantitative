import { useState } from "react";
import { expiryTiers } from "../lib/colors.js";
import { EXPIRY_LABELS, formatLocation, groupLinesByProduct, isActive, validateQuantity } from "../lib/shipmentsLogic.js";

// API expiry_status -> the shared inventory tier ("later" is the >90 day tier, id "ok").
const TIER_FOR_STATUS = { expired: "expired", d30: "d30", d90: "d90", later: "ok", none: "none" };

export function ExpiryTag({ status, date }) {
  const tier = expiryTiers.find((entry) => entry.id === TIER_FOR_STATUS[status]) || expiryTiers[expiryTiers.length - 1];
  return (
    <span className="ship-tag" style={{ background: tier.color, color: tier.text }} title={`${EXPIRY_LABELS[status]}${date ? ` (${date})` : ""}`}>
      {tier.label}
    </span>
  );
}

function QuantityCell({ line, editable, onCommit }) {
  const [draft, setDraft] = useState(String(line.quantity));
  const [error, setError] = useState("");
  const tracked = line.max_quantity !== null && line.max_quantity !== undefined;

  async function commit() {
    if (draft === String(line.quantity)) {
      setError("");
      return;
    }
    const problem = validateQuantity(draft, line);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    const result = await onCommit(line, Number(draft));
    if (!result.ok) {
      setError(result.error);
      setDraft(String(line.quantity));
    }
  }

  if (!editable) {
    return <span className="ship-qty-static">{line.quantity}</span>;
  }

  return (
    <div className="ship-qty">
      <input
        type="number"
        min="1"
        max={tracked ? line.max_quantity : undefined}
        inputMode="numeric"
        value={draft}
        aria-label={`Quantity of ${line.name}`}
        aria-invalid={error ? "true" : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
      />
      <span className="ship-qty-stock">
        {tracked ? `${line.on_hand} on hand, ${Math.max(line.available, 0)} more available` : "not tracked"}
      </span>
      {error ? <span className="ship-error" role="alert">{error}</span> : null}
    </div>
  );
}

// Lines grouped under their product; each lot/expiry/location is its own row.
export default function ShipmentLines({ shipment, canEdit, onTick, onQuantity, onRemove }) {
  const active = isActive(shipment);
  const editable = canEdit && active;
  const groups = groupLinesByProduct(shipment.lines || []);

  if (groups.length === 0) {
    return <p className="ship-empty">{shipment.kind === "non_inventory" ? "Recorded without inventory lines." : "No items yet."}</p>;
  }

  return (
    <div className="ship-lines-scroll">
      <table className="ship-lines">
        <thead>
          <tr>
            {active ? <th scope="col" className="ship-col-check">Pulled</th> : null}
            {active ? <th scope="col" className="ship-col-check">Consol.</th> : null}
            <th scope="col">Item</th>
            <th scope="col">Location</th>
            <th scope="col">Expiry</th>
            <th scope="col">Qty</th>
            {editable ? <th scope="col"><span className="visually-hidden">Remove</span></th> : null}
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.name}>
            {group.lines.length > 1 ? (
              <tr className="ship-group-row">
                <th colSpan={active ? (editable ? 7 : 6) : 4}>{group.name} <span>{group.lines.length} lots, {group.units} units</span></th>
              </tr>
            ) : null}
            {group.lines.map((line) => (
              <tr key={line.id} className={line.picked ? "ship-line-picked" : undefined}>
                {active ? (
                  <td className="ship-col-check">
                    <input type="checkbox" checked={Boolean(line.picked)} disabled={!canEdit} aria-label={`Pulled: ${line.name}`}
                      onChange={(event) => onTick(line, { picked: event.target.checked, ...(event.target.checked ? {} : { consolidated: false }) })} />
                  </td>
                ) : null}
                {active ? (
                  <td className="ship-col-check">
                    <input type="checkbox" checked={Boolean(line.consolidated)} disabled={!canEdit} aria-label={`Consolidated: ${line.name}`}
                      onChange={(event) => onTick(line, { consolidated: event.target.checked, ...(event.target.checked ? { picked: true } : {}) })} />
                  </td>
                ) : null}
                <td>
                  <span className="ship-line-name">{group.lines.length > 1 ? "" : `${line.name} `}</span>
                  <span className="ship-line-lot">{line.lot_number ? `Lot ${line.lot_number}` : group.lines.length > 1 ? "No lot" : ""}</span>
                </td>
                <td className="ship-line-loc">{formatLocation(line)}</td>
                <td><ExpiryTag status={line.expiry_status} date={line.expiration_date} /> <span className="ship-line-date">{line.expiration_date || ""}</span></td>
                <td><QuantityCell line={line} editable={editable} onCommit={onQuantity} /></td>
                {editable ? (
                  <td>
                    <button type="button" className="ship-icon-button" aria-label={`Remove ${line.name} from shipment`} onClick={() => onRemove(line)}>
                      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

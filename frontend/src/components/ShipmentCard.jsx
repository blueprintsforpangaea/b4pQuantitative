import { useEffect, useState } from "react";
import { STAGE_LABELS, isActive, linesWithQuantity, linesWithout, nextStage, parseRequestIds, previousActiveStage, shipmentTotals, formatMoney } from "../lib/shipmentsLogic.js";
import ShipmentLines from "./ShipmentLines.jsx";
import ShipmentTracker from "./ShipmentTracker.jsx";

function TextField({ label, value, canEdit, onSave, list, type = "text", multiline = false }) {
  const [draft, setDraft] = useState(value || "");
  useEffect(() => setDraft(value || ""), [value]);
  const save = () => draft !== (value || "") && onSave(draft);
  const common = {
    value: draft, disabled: !canEdit, list, onChange: (event) => setDraft(event.target.value), onBlur: save,
    onKeyDown: (event) => !multiline && event.key === "Enter" && event.currentTarget.blur(),
  };
  return (
    <label className="ship-field">
      <span>{label}</span>
      {multiline ? <textarea rows="2" {...common} /> : <input type={type} {...common} />}
    </label>
  );
}

export default function ShipmentCard({ shipment, expanded, onToggle, canEdit, actions, onAddItems, onPrint }) {
  const [confirming, setConfirming] = useState("");
  const [error, setError] = useState("");
  const active = isActive(shipment);
  const totals = shipmentTotals(shipment);
  const forward = nextStage(shipment.stage);
  const back = previousActiveStage(shipment.stage);
  const patch = async (body) => {
    const result = await actions.patch(shipment.id, body);
    setError(result.ok ? "" : result.error);
    return result;
  };

  async function advance() {
    // Shipping takes stock out of inventory, so ask first.
    if (forward === "shipped" && confirming !== "shipped") {
      setConfirming("shipped");
      return;
    }
    setConfirming("");
    await patch({ stage: forward });
  }

  const unpickedLines = (shipment.lines || []).filter((line) => line.item_id && !line.picked).length;
  const typeClass = shipment.shipment_type === "International" ? "ship-tag-intl" : "ship-tag-local";

  return (
    <article className={`ship-card ship-card-${shipment.stage}`}>
      <button type="button" className="ship-card-head" aria-expanded={expanded} onClick={onToggle}>
        <span className="ship-card-title">
          <strong>{shipment.name}</strong>
          <span className="ship-card-sub">{shipment.recipient && shipment.recipient !== shipment.name ? `${shipment.recipient} / ` : ""}{shipment.id}</span>
        </span>
        <span className={`ship-tag ${typeClass}`}>{shipment.shipment_type || "Local"}</span>
        {shipment.kind === "non_inventory" ? <span className="ship-tag ship-tag-none">No inventory</span> : null}
        <span className="ship-card-totals">{totals.units} units / {formatMoney(totals.value)}</span>
        <span className="ship-card-stage">{STAGE_LABELS[shipment.stage]}</span>
        <svg className="ship-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      </button>
      <ShipmentTracker shipment={shipment} />

      {expanded ? (
        <div className="ship-card-body">
          <div className="ship-fields">
            <TextField label="Blueprints contact" value={shipment.blueprints_contact} canEdit={canEdit} list="ship-roster" onSave={(v) => patch({ blueprints_contact: v })} />
            <TextField label="Shipping method" value={shipment.shipping_method} canEdit={canEdit} list="ship-methods" onSave={(v) => patch({ shipping_method: v })} />
            <TextField label="Recipient" value={shipment.recipient} canEdit={canEdit} onSave={(v) => patch({ recipient: v })} />
            <TextField label="Ship date" type="date" value={shipment.ship_date} canEdit={canEdit} onSave={(v) => patch({ ship_date: v || null })} />
            <TextField label="Request ID(s), comma separated" value={(shipment.request_ids || []).join(", ")} canEdit={canEdit} onSave={(v) => patch({ request_ids: parseRequestIds(v) })} />
            <TextField label="Notes" value={shipment.notes} canEdit={canEdit} multiline onSave={(v) => patch({ notes: v })} />
          </div>
          {(shipment.request_ids || []).length > 0 ? (
            <p className="ship-request-links">Fulfils request: {shipment.request_ids.map((id) => <span key={id} className="ship-tag ship-tag-request">{id}</span>)}</p>
          ) : null}

          <ShipmentLines
            shipment={shipment}
            canEdit={canEdit}
            onTick={(line, flags) => actions.tick(shipment, line, flags)}
            onQuantity={(line, quantity) => actions.setLines(shipment.id, linesWithQuantity(shipment.lines, line.id, quantity))}
            onRemove={(line) => actions.setLines(shipment.id, linesWithout(shipment.lines, line.id))}
          />

          <div className="ship-actions">
            {active && canEdit ? <button type="button" className="secondary-button" onClick={onAddItems}>Add items</button> : null}
            <button type="button" className="secondary-button" onClick={onPrint}>Print / save PDF</button>
            <span className="ship-actions-spacer" />
            {canEdit && back ? <button type="button" className="secondary-button" onClick={() => patch({ stage: back })}>Back to {STAGE_LABELS[back]}</button> : null}
            {canEdit && forward ? (
              <button type="button" className="primary-button" onClick={advance}>
                {confirming === "shipped" ? "Confirm: removes stock from inventory" : `Mark ${STAGE_LABELS[forward].toLowerCase()}`}
              </button>
            ) : null}
            {confirming ? <button type="button" className="secondary-button" onClick={() => setConfirming("")}>Cancel</button> : null}
          </div>
          {active && unpickedLines > 0 && shipment.stage !== "planned" ? <p className="ship-hint">{unpickedLines} line(s) not pulled yet.</p> : null}
          {error ? <p className="ship-error" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

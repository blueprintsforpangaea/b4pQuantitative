import { useEffect, useMemo, useState } from "react";
import { blueprintsRosterNames } from "../lib/shipments.js";
import { ACTIVE_STAGES, SHIPPING_METHODS, splitShippingMethod, allocatedByItem, expiryTier, linesWithItemAdded, parseRequestIds } from "../lib/shipmentsLogic.js";
import { ExpiryTag } from "./ShipmentLines.jsx";

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className={wide ? "shipment-modal shipment-modal-large" : "shipment-modal"} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="ship-modal-head">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ContactAndMethodDatalists() {
  return <datalist id="ship-roster">{blueprintsRosterNames.map((name) => <option key={name} value={name} />)}</datalist>;
}

// Car / Boat / Plane / Other, with free text when Other. `onChange` gets the stored method string.
export function ShippingMethodField({ value, disabled, onChange, labelClass = "modal-field" }) {
  const { choice, other } = splitShippingMethod(value);
  const [otherText, setOtherText] = useState(other);
  const [picked, setPicked] = useState(choice);
  useEffect(() => {
    setPicked(choice);
    setOtherText(other);
  }, [choice, other]);

  const choose = (next) => {
    setPicked(next);
    if (next !== "Other") onChange(next);
  };

  return (
    <label className={labelClass}>
      <span>Shipping method</span>
      <select value={picked} disabled={disabled} onChange={(event) => choose(event.target.value)}>
        <option value="">Not set</option>
        {SHIPPING_METHODS.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      {picked === "Other" ? (
        <input value={otherText} disabled={disabled} placeholder="Describe the method" aria-label="Other shipping method"
          onChange={(event) => setOtherText(event.target.value)} onBlur={() => otherText !== other && onChange(otherText.trim() || "Other")} />
      ) : null}
    </label>
  );
}

// New shipment: header fields only; items are added from the shipment or from Total Inventory.
export function NewShipmentModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: "", recipient: "", shipment_type: "Local", shipping_method: "", blueprints_contact: "", request_ids: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Give the shipment a name.");
      return;
    }
    setBusy(true);
    const result = await onCreate({ ...form, name: form.name.trim(), request_ids: parseRequestIds(form.request_ids), lines: [] });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <Modal title="New shipment" onClose={onClose}>
      <form onSubmit={submit} className="ship-form">
        <label className="modal-field"><span>Name</span><input value={form.name} onChange={set("name")} autoFocus required /></label>
        <label className="modal-field"><span>Recipient</span><input value={form.recipient} onChange={set("recipient")} /></label>
        <label className="modal-field"><span>Type</span>
          <select value={form.shipment_type} onChange={set("shipment_type")}><option>Local</option><option>International</option></select>
        </label>
        <label className="modal-field"><span>Blueprints contact</span><input list="ship-roster" value={form.blueprints_contact} onChange={set("blueprints_contact")} /></label>
        <ShippingMethodField value={form.shipping_method} onChange={(method) => setForm((current) => ({ ...current, shipping_method: method }))} />
        <label className="modal-field"><span>Request ID(s), comma separated</span><input value={form.request_ids} onChange={set("request_ids")} placeholder="REQ-..." /></label>
        {error ? <p className="ship-error" role="alert">{error}</p> : null}
        <div className="ship-form-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>Create shipment</button>
        </div>
      </form>
    </Modal>
  );
}

// Shipped without inventory rows: header plus a dollar value and optional unit count.
export function NonInventoryModal({ onClose, onCreate, onPatch }) {
  const [form, setForm] = useState({ recipient: "", blueprints_contact: "", shipment_type: "Local", ship_date: new Date().toISOString().slice(0, 10), value: "", unit_count: "" });
  const [error, setError] = useState("");
  // Id of a shipment that was created but not yet moved to shipped, so a retry never creates a second one.
  const [createdId, setCreatedId] = useState(null);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    if (createdId) {
      const retried = await onPatch(createdId, { stage: "shipped" });
      if (retried.ok) onClose();
      else setError(retried.error);
      return;
    }
    if (!form.recipient.trim() || form.value === "" || Number(form.value) < 0) {
      setError("Enter the clinic name and a value of zero or more.");
      return;
    }
    const result = await onCreate({
      name: form.recipient.trim(), recipient: form.recipient.trim(), shipment_type: form.shipment_type, blueprints_contact: form.blueprints_contact,
      ship_date: form.ship_date, kind: "non_inventory", value: Number(form.value), unit_count: form.unit_count === "" ? null : Number(form.unit_count), lines: [],
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // A new shipment starts as planned; with no lines, moving it to shipped takes no stock.
    setCreatedId(result.result.id);
    const moved = await onPatch(result.result.id, { stage: "shipped" });
    if (moved.ok) onClose();
    else setError(moved.error);
  }

  return (
    <Modal title="Record non-inventory shipment" onClose={onClose}>
      <form onSubmit={submit} className="ship-form">
        <label className="modal-field"><span>Clinic or recipient</span><input value={form.recipient} onChange={set("recipient")} autoFocus required /></label>
        <label className="modal-field"><span>Blueprints contact</span><input list="ship-roster" value={form.blueprints_contact} onChange={set("blueprints_contact")} /></label>
        <label className="modal-field"><span>Type</span><select value={form.shipment_type} onChange={set("shipment_type")}><option>Local</option><option>International</option></select></label>
        <label className="modal-field"><span>Ship date</span><input type="date" max={new Date().toISOString().slice(0, 10)} value={form.ship_date} onChange={set("ship_date")} required /></label>
        <label className="modal-field"><span>Value (USD)</span><input type="number" min="0" step="0.01" value={form.value} onChange={set("value")} required /></label>
        <label className="modal-field"><span>Units (optional)</span><input type="number" min="0" value={form.unit_count} onChange={set("unit_count")} /></label>
        {error ? <p className="ship-error" role="alert">{error}</p> : null}
        <div className="ship-form-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button">Record shipment</button>
        </div>
      </form>
    </Modal>
  );
}

// Pick inventory to add to a shipment. `shipmentId` fixed, or a chooser over active shipments when null.
export function AddItemsModal({ items, shipments, shipmentId = null, preselected = [], onClose, onSetLines, onCreate }) {
  const active = shipments.filter((shipment) => ACTIVE_STAGES.includes(shipment.stage));
  const [targetId, setTargetId] = useState(shipmentId || active[0]?.id || "__new__");
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState({});
  const [message, setMessage] = useState("");
  const allocated = useMemo(() => allocatedByItem(shipments), [shipments]);
  const target = shipments.find((shipment) => shipment.id === targetId);
  const term = search.trim().toLowerCase();

  const rows = useMemo(() => {
    const base = preselected.length > 0 ? preselected : items;
    return base
      .filter((item) => !term || `${item.name} ${item.lot_number || ""} ${item.category}`.toLowerCase().includes(term))
      .map((item) => ({ item, available: Math.max(0, item.quantity - (allocated.get(String(item.id)) || 0)) }))
      .sort((a, b) => a.item.name.localeCompare(b.item.name))
      .slice(0, 40);
  }, [items, preselected, term, allocated]);

  async function add(item, available) {
    const quantity = Number(quantities[item.id] ?? Math.min(1, available));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > available) {
      setMessage(`Choose 1 to ${available} units of ${item.name}.`);
      return;
    }
    let id = targetId;
    if (id === "__new__") {
      if (!newName.trim()) {
        setMessage("Name the new shipment first.");
        return;
      }
      const created = await onCreate({ name: newName.trim(), lines: [{ item_id: String(item.id), quantity }] });
      setMessage(created.ok ? `Added ${quantity} x ${item.name} to a new shipment.` : created.error);
      if (created.ok) {
        const made = created.result?.id;
        if (made) setTargetId(made);
      }
      return;
    }
    const result = await onSetLines(id, linesWithItemAdded(target?.lines || [], item.id, quantity));
    setMessage(result.ok ? `Added ${quantity} x ${item.name}.` : result.error);
  }

  return (
    <Modal title="Add items to a shipment" onClose={onClose} wide>
      <div className="ship-form">
        {shipmentId ? null : (
          <label className="modal-field"><span>Shipment</span>
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              {active.map((shipment) => <option key={shipment.id} value={shipment.id}>{shipment.name}</option>)}
              <option value="__new__">New shipment...</option>
            </select>
          </label>
        )}
        {targetId === "__new__" ? <label className="modal-field"><span>New shipment name</span><input value={newName} onChange={(event) => setNewName(event.target.value)} /></label> : null}
        <label className="modal-field"><span>Search supplies</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, lot or category" /></label>
        <p className="ship-message" role="status">{message}</p>
        <ul className="ship-pick-list">
          {rows.map(({ item, available }) => (
            <li key={item.id}>
              <div className="ship-pick-main">
                <strong>{item.name}</strong>
                <span>{item.lot_number ? `Lot ${item.lot_number} / ` : ""}Pallet {item.pallet_number || "?"} / {item.category_box} #{item.box_number || "?"}</span>
              </div>
              <ExpiryTag status={expiryTier(item.expiration_date)} date={item.expiration_date} />
              <span className="ship-pick-avail">{available} available</span>
              <input type="number" min="1" max={available} defaultValue={Math.min(1, available)} aria-label={`Units of ${item.name}`} disabled={available === 0}
                onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} />
              <button type="button" className="secondary-button" disabled={available === 0} onClick={() => add(item, available)}>Add</button>
            </li>
          ))}
          {rows.length === 0 ? <li className="ship-empty">No matching supplies.</li> : null}
        </ul>
      </div>
    </Modal>
  );
}

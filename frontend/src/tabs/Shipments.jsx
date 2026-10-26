import { useEffect, useMemo, useState } from "react";
import { ContactAndMethodDatalists, AddItemsModal, NewShipmentModal, NonInventoryModal } from "../components/ShipmentForms.jsx";
import ShipmentCard from "../components/ShipmentCard.jsx";
import { LegacyImportBanner, UnlockBar } from "../components/ShipmentImport.jsx";
import ShipmentPrint from "../components/ShipmentPrint.jsx";
import { readAdminToken } from "../lib/shipmentsApi.js";
import { isActive, sortShipments } from "../lib/shipmentsLogic.js";

const PAST_PAGE = 50;

function matches(shipment, term) {
  if (!term) return true;
  const haystack = [shipment.name, shipment.recipient, shipment.id, shipment.blueprints_contact, shipment.shipping_method, ...(shipment.request_ids || [])].join(" ").toLowerCase();
  return haystack.includes(term);
}

// Shipments tab: active shipments with a step tracker, past shipments, print view.
// `state` is the object from useShipments() in lib/useShipments.js; `items` is the inventory list.
export default function Shipments({ items, state, focus = null }) {
  const { shipments, loading, error, notice, setNotice, reload } = state;
  const [subtab, setSubtab] = useState("active");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [expanded, setExpanded] = useState(() => new Set());
  const [modal, setModal] = useState(null);
  const [printId, setPrintId] = useState(null);
  const [pastLimit, setPastLimit] = useState(PAST_PAGE);
  const [tokenVersion, setTokenVersion] = useState(0);
  // Sheet mode keeps shipments in this browser, like before the database: no admin token needed.
  const canEdit = useMemo(() => state.local || Boolean(readAdminToken()), [state.local, tokenVersion]);

  // Jump from a KPI data point: open the Past list on that shipment.
  useEffect(() => {
    if (!focus) return;
    setSubtab("past");
    setSearch(focus.name || "");
    setTypeFilter("All");
    setExpanded((current) => new Set(current).add(focus.id));
  }, [focus]);

  const term = search.trim().toLowerCase();
  const visible = sortShipments(shipments).filter((shipment) => (subtab === "active") === isActive(shipment) && matches(shipment, term) && (typeFilter === "All" || shipment.shipment_type === typeFilter));
  const counts = { active: shipments.filter(isActive).length, past: shipments.length - shipments.filter(isActive).length };
  const shown = subtab === "past" ? visible.slice(0, pastLimit) : visible;

  const toggle = (id) => setExpanded((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  function print(shipment) {
    setPrintId(shipment.id);
    // Wait one frame so the print section is in the document before the dialog opens.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
  }

  const printing = shipments.find((shipment) => shipment.id === printId) || null;

  return (
    <section className="panel ship-tab">
      <ContactAndMethodDatalists />
      <div className="panel-header">
        <div>
          <p className="section-label">Shipments</p>
          <h2>Plan, pull and track outgoing shipments</h2>
        </div>
        <div className="ship-header-actions">
          <button type="button" className="primary-button" disabled={!canEdit} onClick={() => setModal("new")}>New shipment</button>
          <button type="button" className="secondary-button" disabled={!canEdit} onClick={() => setModal("non-inventory")}>Record non-inventory</button>
        </div>
      </div>

      <UnlockBar canEdit={canEdit} onUnlock={() => { setTokenVersion((v) => v + 1); setNotice(""); reload(); }} />
      {state.local ? (
        <p className="ship-hint" role="note">The dashboard is reading the Google Sheet, so shipments are saved in this browser only.</p>
      ) : (
        <LegacyImportBanner canEdit={canEdit} onImport={state.importOld} />
      )}
      {error ? <p className="ship-error" role="alert">{error} <button type="button" className="secondary-button" onClick={reload}>Retry</button></p> : null}
      {notice ? <p className="ship-error" role="alert">{notice}</p> : null}

      <div className="ship-toolbar">
        <div className="shipment-subtabs" role="tablist" aria-label="Shipment lists">
          {["active", "past"].map((id) => (
            <button key={id} type="button" role="tab" aria-selected={subtab === id} className={subtab === id ? "shipment-subtab active" : "shipment-subtab"} onClick={() => setSubtab(id)}>
              {id === "active" ? "Active" : "Past"} ({counts[id]})
            </button>
          ))}
        </div>
        <input type="search" className="ship-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, recipient, request ID" aria-label="Search shipments" />
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by type">
          <option>All</option><option>Local</option><option>International</option>
        </select>
      </div>

      {loading ? <p className="ship-empty">Loading shipments...</p> : null}
      {!loading && shown.length === 0 && !error ? (
        <p className="ship-empty">{subtab === "active" ? "No active shipments. Create one, or add items from Total Inventory." : "No past shipments match."}</p>
      ) : null}

      <div className="ship-list">
        {shown.map((shipment) => (
          <ShipmentCard
            key={shipment.id}
            shipment={shipment}
            expanded={expanded.has(shipment.id)}
            onToggle={() => toggle(shipment.id)}
            canEdit={canEdit}
            actions={state}
            onAddItems={() => setModal({ addTo: shipment.id })}
            onPrint={() => print(shipment)}
          />
        ))}
      </div>
      {subtab === "past" && visible.length > pastLimit ? (
        <button type="button" className="secondary-button" onClick={() => setPastLimit((n) => n + PAST_PAGE)}>Show more ({visible.length - pastLimit} left)</button>
      ) : null}

      {modal === "new" ? <NewShipmentModal onClose={() => setModal(null)} onCreate={state.create} /> : null}
      {modal === "non-inventory" ? <NonInventoryModal onClose={() => setModal(null)} onCreate={state.create} /> : null}
      {modal?.addTo ? <AddItemsModal items={items} shipments={shipments} shipmentId={modal.addTo} onClose={() => setModal(null)} onSetLines={state.setLines} onCreate={state.create} /> : null}
      <ShipmentPrint shipment={printing} />
    </section>
  );
}

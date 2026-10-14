import { MONTH_AXIS_LABELS } from "../lib/charts.js";
import { parseLocalDate, todayIsoDate } from "../lib/dates.js";
import { formatCurrency, formatNumber } from "../lib/format.js";
import { blueprintsRosterNames, normalizePastShipmentStatus, normalizeRequestedQuantity, normalizeShipmentItem, normalizeShipmentType, shipmentTypeOptions, transportTypeOptions, withConsolidationCompletionDate } from "../lib/shipments.js";

export default function ShipmentModals({
  currentShipments,
  deliveryDate,
  deliveryDateMode,
  isCreateShipmentModalOpen,
  isNonInventoryShipmentModalOpen,
  isShipmentItemsDataOpen,
  isShipmentModalOpen,
  isShipmentValueDataOpen,
  items,
  itemsFromSupplyIds,
  jumpToPastShipment,
  newShipmentPointOfContact,
  newShipmentRecipientName,
  newShipmentRecipientPointOfContact,
  newShipmentSupplyIds,
  newShipmentType,
  nonInventoryClinicName,
  nonInventoryPointOfContact,
  nonInventoryShipmentDate,
  nonInventoryShipmentType,
  nonInventoryValuation,
  pendingShipmentItems,
  selectedShipmentId,
  setActiveShipmentSubtab,
  setActiveTab,
  setDeliveryDate,
  setDeliveryDateMode,
  setIsCreateShipmentModalOpen,
  setIsNonInventoryShipmentModalOpen,
  setIsShipmentItemsDataOpen,
  setIsShipmentModalOpen,
  setIsShipmentValueDataOpen,
  setNewShipmentPointOfContact,
  setNewShipmentRecipientName,
  setNewShipmentRecipientPointOfContact,
  setNewShipmentSupplyIds,
  setNewShipmentType,
  setNonInventoryClinicName,
  setNonInventoryPointOfContact,
  setNonInventoryShipmentDate,
  setNonInventoryShipmentType,
  setNonInventoryShipments,
  setNonInventoryValuation,
  setPendingShipmentItems,
  setSelectedInventoryIds,
  setSelectedShipmentId,
  setShipmentDate,
  setShipmentNotes,
  setShipments,
  setShippingShipmentId,
  setTransportType,
  setTransportTypeOther,
  shipmentDate,
  shipmentItemsByYearPoints,
  shipmentItemsKpiYear,
  shipmentNotes,
  shipmentValueByYearPoints,
  shipmentValueKpiYear,
  shipments,
  shippingShipmentId,
  transportType,
  transportTypeOther,
}) {
  function closeShipmentModal() {
    setIsShipmentModalOpen(false);
    setPendingShipmentItems([]);
    setNewShipmentRecipientName("");
    setNewShipmentType("Local");
    setNewShipmentPointOfContact("");
    setNewShipmentRecipientPointOfContact("");
    setNewShipmentSupplyIds("");
  }

  function closeCreateShipmentModal() {
    setIsCreateShipmentModalOpen(false);
    setNewShipmentRecipientName("");
    setNewShipmentType("Local");
    setNewShipmentPointOfContact("");
    setNewShipmentRecipientPointOfContact("");
    setNewShipmentSupplyIds("");
  }

  function closeNonInventoryShipmentModal() {
    setIsNonInventoryShipmentModalOpen(false);
    setNonInventoryClinicName("");
    setNonInventoryPointOfContact("");
    setNonInventoryShipmentType("Local");
    setNonInventoryShipmentDate(todayIsoDate());
    setNonInventoryValuation("");
  }

  function createNonInventoryShipment() {
    const clinicName = nonInventoryClinicName.trim();
    const pointOfContact = nonInventoryPointOfContact.trim();
    const shippedAt = nonInventoryShipmentDate.trim();
    const valuation = Number(nonInventoryValuation);

    if (
      !clinicName ||
      !blueprintsRosterNames.includes(pointOfContact) ||
      !shippedAt ||
      shippedAt > todayIsoDate() ||
      nonInventoryValuation === "" ||
      valuation < 0
    ) {
      return;
    }

    setNonInventoryShipments((currentShipments) => [
      ...currentShipments,
      {
        id: `non-inventory-shipment-${Date.now()}`,
        clinicName,
        pointOfContact,
        shipmentType: normalizeShipmentType(nonInventoryShipmentType),
        shippedAt,
        valuation,
        createdAt: todayIsoDate(),
      },
    ]);
    closeNonInventoryShipmentModal();
  }

  function buildShipmentRecord(
    recipientName,
    shipmentType,
    pointOfContact,
    recipientPointOfContact,
    items = []
  ) {
    return {
      id: `shipment-${Date.now()}`,
      recipientName,
      shipmentType: normalizeShipmentType(shipmentType),
      pointOfContact,
      recipientPointOfContact: recipientPointOfContact || "TBD",
      filterMode: "original",
      createdAt: todayIsoDate(),
      consolidationStartedAt: "",
      consolidationCompletedAt: "",
      items,
    };
  }

  function addItemToShipment() {
    if (pendingShipmentItems.length === 0) {
      return;
    }

    setShipments((currentShipments) => {
      let workingShipments = currentShipments;
      let targetShipmentId = selectedShipmentId;

      if (selectedShipmentId === "__new__") {
        const recipientName = newShipmentRecipientName.trim();
        const shipmentType = newShipmentType;
        const pointOfContact = newShipmentPointOfContact.trim();
        const recipientPointOfContact = newShipmentRecipientPointOfContact.trim() || "TBD";

        if (!recipientName || !shipmentType || !blueprintsRosterNames.includes(pointOfContact)) {
          return currentShipments;
        }

        const newShipment = buildShipmentRecord(
          recipientName,
          shipmentType,
          pointOfContact,
          recipientPointOfContact
        );
        targetShipmentId = newShipment.id;
        workingShipments = [
          ...currentShipments,
          newShipment,
        ];
      }

      return workingShipments.map((shipment) => {
        if (shipment.id !== targetShipmentId) {
          return shipment;
        }

        const existingIds = new Set(shipment.items.map((shipmentItem) => String(shipmentItem.id)));
        const newItems = pendingShipmentItems
          .filter((item) => !existingIds.has(String(item.id)))
          .map(normalizeShipmentItem);

        return {
          ...shipment,
          items: [...shipment.items, ...newItems],
        };
      });
    });

    setActiveTab("shipments");
    setActiveShipmentSubtab("current");
    setSelectedInventoryIds([]);
    closeShipmentModal();
  }

  function createNewShipment() {
    const recipientName = newShipmentRecipientName.trim();
    const shipmentType = newShipmentType;
    const pointOfContact = newShipmentPointOfContact.trim();
    const recipientPointOfContact = newShipmentRecipientPointOfContact.trim() || "TBD";
    const shipmentItems = itemsFromSupplyIds(newShipmentSupplyIds);

    if (!recipientName || !shipmentType || !blueprintsRosterNames.includes(pointOfContact)) {
      return;
    }

    setShipments((currentShipments) => [
      ...currentShipments,
      buildShipmentRecord(
        recipientName,
        shipmentType,
        pointOfContact,
        recipientPointOfContact,
        shipmentItems.map(normalizeShipmentItem)
      ),
    ]);
    closeCreateShipmentModal();
  }

  function closeShippingModal() {
    setShippingShipmentId(null);
    setShipmentDate("");
    setTransportType("Car");
    setTransportTypeOther("");
    setDeliveryDate("");
    setDeliveryDateMode("date");
    setShipmentNotes("");
  }

  function markShipmentComplete() {
    if (!shippingShipmentId) {
      return;
    }

    const resolvedShipmentDate = shipmentDate.trim();
    const resolvedTransportType = transportType === "Other"
      ? transportTypeOther.trim()
      : transportType;
    const resolvedDeliveryDate = deliveryDateMode === "tbd"
      ? "TBD"
      : deliveryDate.trim();

    if (!resolvedShipmentDate || !resolvedTransportType || !resolvedDeliveryDate) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) =>
        shipment.id === shippingShipmentId
          ? {
              ...shipment,
              isCompleted: true,
              shippedAt: resolvedShipmentDate,
              transportType: resolvedTransportType,
              deliveryDate: resolvedDeliveryDate,
              pastShipmentStatus: normalizePastShipmentStatus(undefined, resolvedDeliveryDate),
              pastShipmentStatusManuallySet: false,
              shipmentNotes: shipmentNotes.trim(),
            }
          : shipment
      )
    );
    closeShippingModal();
  }

  const shipmentDetailsComplete =
    newShipmentRecipientName.trim() &&
    newShipmentType &&
    blueprintsRosterNames.includes(newShipmentPointOfContact);

  const shippingDetailsComplete =
    shipmentDate.trim() &&
    (transportType !== "Other" || transportTypeOther.trim()) &&
    (deliveryDateMode === "tbd" || deliveryDate.trim());

  const shipmentValuePointsByMonth = MONTH_AXIS_LABELS.map((month, monthIndex) => ({
    month,
    points: shipmentValueByYearPoints.filter((point) => {
      const shippedDate = parseLocalDate(point.shipmentDateLabel);
      return Boolean(shippedDate) && shippedDate.getMonth() === monthIndex;
    }),
  }));

  const shipmentItemPointsByMonth = MONTH_AXIS_LABELS.map((month, monthIndex) => ({
    month,
    points: shipmentItemsByYearPoints.filter((point) => {
      const shippedDate = parseLocalDate(point.shipmentDateLabel);
      return Boolean(shippedDate) && shippedDate.getMonth() === monthIndex;
    }),
  }));

  return (
    <>
      {isShipmentModalOpen && pendingShipmentItems.length > 0 ? (
        <div className="modal-backdrop" role="presentation" onClick={closeShipmentModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Add To Shipment</p>
                <h2 id="shipment-modal-title">
                  Choose a shipment for {pendingShipmentItems.length} selected item
                  {pendingShipmentItems.length === 1 ? "" : "s"}
                </h2>
              </div>
              <button type="button" className="modal-close" onClick={closeShipmentModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                {pendingShipmentItems.length === 1
                  ? pendingShipmentItems[0].exactSupplyName
                  : `${pendingShipmentItems.length} inventory items selected`}
              </p>

              <label className="modal-field">
                <span>Select shipment</span>
                <select
                  value={selectedShipmentId}
                  onChange={(event) => setSelectedShipmentId(event.target.value)}
                >
                  {currentShipments.map((shipment) => (
                    <option key={shipment.id} value={shipment.id}>
                      {shipment.recipientName || shipment.name || shipment.id}
                    </option>
                  ))}
                  <option value="__new__">Create new shipment</option>
                </select>
              </label>

              {selectedShipmentId === "__new__" ? (
                <>
                  <label className="modal-field">
                    <span>Recipient Name</span>
                    <input
                      type="text"
                      value={newShipmentRecipientName}
                      onChange={(event) => setNewShipmentRecipientName(event.target.value)}
                      placeholder="Enter recipient name"
                    />
                  </label>
                  <label className="modal-field">
                    <span>Shipment Type</span>
                    <select
                      value={newShipmentType}
                      onChange={(event) => setNewShipmentType(event.target.value)}
                    >
                      {shipmentTypeOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="modal-field">
                    <span>Blueprints Point of Contact</span>
                    <select
                      value={newShipmentPointOfContact}
                      onChange={(event) => setNewShipmentPointOfContact(event.target.value)}
                    >
                      <option value="" disabled>Select active roster member</option>
                      {blueprintsRosterNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="modal-field">
                    <span className="modal-field-header">
                      <span>Recipient Point of Contact</span>
                      <button
                        type="button"
                        className="modal-shortcut-button"
                        onClick={() => setNewShipmentRecipientPointOfContact("TBD")}
                      >
                        TBD
                      </button>
                    </span>
                    <input
                      type="text"
                      value={newShipmentRecipientPointOfContact}
                      onChange={(event) => setNewShipmentRecipientPointOfContact(event.target.value)}
                      placeholder="Enter recipient point of contact or select TBD"
                    />
                  </label>
                </>
              ) : null}
            </div>

            <div className="shipment-modal-actions">
              <button type="button" className="secondary-button" onClick={closeShipmentModal}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={addItemToShipment}
                disabled={selectedShipmentId === "__new__" && !shipmentDetailsComplete}
              >
                Add to shipment
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shippingShipmentId ? (
        <div className="modal-backdrop" role="presentation" onClick={closeShippingModal}>
          <div
            className="shipment-modal shipment-modal-large"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipping-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Shipped</p>
                <h2 id="shipping-modal-title">Shipment details</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeShippingModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <label className="modal-field">
                <span>Shipment Date</span>
                <input
                  type="date"
                  value={shipmentDate}
                  onChange={(event) => {
                    setShipmentDate(event.target.value);
                    if (deliveryDateMode === "same-day") {
                      setDeliveryDate(event.target.value);
                    }
                  }}
                />
              </label>

              <label className="modal-field">
                <span>Transport Type</span>
                <select
                  value={transportType}
                  onChange={(event) => setTransportType(event.target.value)}
                >
                  {transportTypeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              {transportType === "Other" ? (
                <label className="modal-field">
                  <span>Exact Transport Type</span>
                  <input
                    type="text"
                    value={transportTypeOther}
                    onChange={(event) => setTransportTypeOther(event.target.value)}
                    placeholder="Enter exact transport type"
                  />
                </label>
              ) : null}

              <label className="modal-field">
                <div className="modal-field-header">
                  <span>Delivery Date</span>
                  <div className="modal-shortcuts">
                    <button
                      type="button"
                      className="modal-shortcut-button"
                      onClick={() => {
                        setDeliveryDateMode("same-day");
                        setDeliveryDate(shipmentDate);
                      }}
                    >
                      Same day
                    </button>
                    <button
                      type="button"
                      className="modal-shortcut-button"
                      onClick={() => {
                        setDeliveryDateMode("tbd");
                        setDeliveryDate("");
                      }}
                    >
                      TBD
                    </button>
                  </div>
                </div>
                <input
                  type="date"
                  value={deliveryDate}
                  disabled={deliveryDateMode === "tbd"}
                  onChange={(event) => {
                    setDeliveryDateMode("date");
                    setDeliveryDate(event.target.value);
                  }}
                />
              </label>

              <label className="modal-field">
                <span>Notes</span>
                <textarea
                  value={shipmentNotes}
                  onChange={(event) => setShipmentNotes(event.target.value)}
                  placeholder="Add shipment notes"
                  rows="4"
                />
              </label>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeShippingModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={markShipmentComplete}
                disabled={!shippingDetailsComplete}
              >
                Save Shipped Status
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateShipmentModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeCreateShipmentModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-shipment-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Create Shipment</p>
                <h2 id="create-shipment-modal-title">New shipment details</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeCreateShipmentModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <label className="modal-field">
                <span>Recipient Name</span>
                <input
                  type="text"
                  value={newShipmentRecipientName}
                  onChange={(event) => setNewShipmentRecipientName(event.target.value)}
                  placeholder="Enter recipient name"
                />
              </label>
              <label className="modal-field">
                <span>Shipment Type</span>
                <select
                  value={newShipmentType}
                  onChange={(event) => setNewShipmentType(event.target.value)}
                >
                  {shipmentTypeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="modal-field">
                <span>Blueprints Point of Contact</span>
                <select
                  value={newShipmentPointOfContact}
                  onChange={(event) => setNewShipmentPointOfContact(event.target.value)}
                >
                  <option value="" disabled>Select active roster member</option>
                  {blueprintsRosterNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="modal-field">
                <span className="modal-field-header">
                  <span>Recipient Point of Contact</span>
                  <button
                    type="button"
                    className="modal-shortcut-button"
                    onClick={() => setNewShipmentRecipientPointOfContact("TBD")}
                  >
                    TBD
                  </button>
                </span>
                <input
                  type="text"
                  value={newShipmentRecipientPointOfContact}
                  onChange={(event) => setNewShipmentRecipientPointOfContact(event.target.value)}
                  placeholder="Enter recipient point of contact or select TBD"
                />
              </label>
              <label className="modal-field">
                <span>Supply IDs</span>
                <input
                  type="text"
                  value={newShipmentSupplyIds}
                  onChange={(event) => setNewShipmentSupplyIds(event.target.value)}
                  placeholder="Paste supply IDs separated by commas"
                />
              </label>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeCreateShipmentModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={createNewShipment}
                disabled={!shipmentDetailsComplete}
              >
                Create Shipment
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isNonInventoryShipmentModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeNonInventoryShipmentModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="non-inventory-shipment-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Non-Inventory Shipment</p>
                <h2 id="non-inventory-shipment-modal-title">Document shipment details</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeNonInventoryShipmentModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <label className="modal-field">
                <span>Recipient / Clinic Name</span>
                <input
                  type="text"
                  value={nonInventoryClinicName}
                  onChange={(event) => setNonInventoryClinicName(event.target.value)}
                  placeholder="Enter recipient or clinic name"
                />
              </label>
              <label className="modal-field">
                <span>Blueprints for Pangaea Point of Contact</span>
                <select
                  value={nonInventoryPointOfContact}
                  onChange={(event) => setNonInventoryPointOfContact(event.target.value)}
                >
                  <option value="" disabled>Select active roster member</option>
                  {blueprintsRosterNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="modal-field">
                <span>Shipment Type</span>
                <select
                  value={nonInventoryShipmentType}
                  onChange={(event) => setNonInventoryShipmentType(event.target.value)}
                >
                  {shipmentTypeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="modal-field">
                <span>Date Shipped</span>
                <input
                  type="date"
                  max={todayIsoDate()}
                  value={nonInventoryShipmentDate}
                  onChange={(event) => setNonInventoryShipmentDate(event.target.value)}
                />
              </label>
              <label className="modal-field">
                <span>Valuation of Items</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={nonInventoryValuation}
                  onChange={(event) => setNonInventoryValuation(event.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>

            <div className="shipment-modal-actions">
              <button type="button" className="secondary-button" onClick={closeNonInventoryShipmentModal}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={createNonInventoryShipment}
                disabled={
                  !nonInventoryClinicName.trim() ||
                  !blueprintsRosterNames.includes(nonInventoryPointOfContact) ||
                  !nonInventoryShipmentDate.trim() ||
                  nonInventoryShipmentDate > todayIsoDate() ||
                  nonInventoryValuation === "" ||
                  Number(nonInventoryValuation) < 0
                }
              >
                Document Shipment
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isShipmentValueDataOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setIsShipmentValueDataOpen(false)}
        >
          <div
            className="shipment-modal shipment-modal-large shipment-value-data-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-value-data-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Shipment Value by Year</p>
                <h2 id="shipment-value-data-modal-title">
                  All shipment value data points for {shipmentValueKpiYear}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsShipmentValueDataOpen(false)}
              >
                x
              </button>
            </div>

            <div className="shipment-value-month-list">
              {shipmentValuePointsByMonth.map(({ month, points }) => (
                <section className="shipment-value-month-group" key={month}>
                  <div className="shipment-value-month-heading">
                    <h3>{month}</h3>
                    <span>{formatNumber(points.length)} data {points.length === 1 ? "point" : "points"}</span>
                  </div>
                  {points.length > 0 ? (
                    <div className="shipment-value-point-grid">
                      {points.map((point) => (
                        <button
                          type="button"
                          className="shipment-value-point-card"
                          key={`${point.shipmentKind}-${point.shipmentId}-${point.dayOffset}`}
                          title={`Open ${point.label}`}
                          onClick={() => {
                            setIsShipmentValueDataOpen(false);
                            jumpToPastShipment(
                              point.shipmentId,
                              point.label,
                              point.shipmentKind
                            );
                          }}
                        >
                          <strong>{point.label}</strong>
                          <span>{point.shipmentDateLabel}</span>
                          <span>
                            {point.shipmentKind === "non-inventory"
                              ? "Non-inventory shipment"
                              : "Inventory shipment"}
                          </span>
                          <span>{formatCurrency(point.shipmentValue)} shipment value</span>
                          <span>{formatCurrency(point.cumulativeValue)} running total</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="shipment-value-month-empty">No shipment data for this month.</p>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isShipmentItemsDataOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setIsShipmentItemsDataOpen(false)}
        >
          <div
            className="shipment-modal shipment-modal-large shipment-value-data-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-items-data-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Shipment Items by Year</p>
                <h2 id="shipment-items-data-modal-title">
                  All shipment item data points for {shipmentItemsKpiYear}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsShipmentItemsDataOpen(false)}
              >
                x
              </button>
            </div>

            <div className="shipment-value-month-list">
              {shipmentItemPointsByMonth.map(({ month, points }) => (
                <section className="shipment-value-month-group" key={month}>
                  <div className="shipment-value-month-heading">
                    <h3>{month}</h3>
                    <span>{formatNumber(points.length)} data {points.length === 1 ? "point" : "points"}</span>
                  </div>
                  {points.length > 0 ? (
                    <div className="shipment-value-point-grid">
                      {points.map((point) => (
                        <button
                          type="button"
                          className="shipment-value-point-card"
                          key={`${point.shipmentId}-${point.dayOffset}`}
                          title={`Open ${point.label}`}
                          onClick={() => {
                            setIsShipmentItemsDataOpen(false);
                            jumpToPastShipment(point.shipmentId, point.label, "inventory");
                          }}
                        >
                          <strong>{point.label}</strong>
                          <span>{point.shipmentDateLabel}</span>
                          <span>Inventory shipment</span>
                          <span>{formatNumber(point.shipmentItems)} items added</span>
                          <span>{formatNumber(point.cumulativeItems)} items running total</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="shipment-value-month-empty">No shipment data for this month.</p>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ShipmentActionModals({
  addingSupplyIdsShipmentId,
  bulkConsolidationCheck,
  consolidatingShipmentItem,
  currentShipments,
  deliveringShipmentId,
  deliveryDate,
  error,
  items,
  itemsFromSupplyIds,
  requestedUnitsValue,
  requestingShipmentItem,
  returningShipmentItem,
  returningShipmentItems,
  revertingDeliveredShipmentId,
  setAddingSupplyIdsShipmentId,
  setBulkConsolidationCheck,
  setConsolidatingShipmentItem,
  setDeliveringShipmentId,
  setDeliveryDate,
  setRequestedUnitsValue,
  setRequestingShipmentItem,
  setReturningShipmentItem,
  setReturningShipmentItems,
  setRevertingDeliveredShipmentId,
  setShipmentNotes,
  setShipmentSupplyIdsInput,
  setShipments,
  shipmentNotes,
  shipmentSupplyIdsInput,
  shipments,
}) {
  const deliveringShipment = shipments.find((shipment) => shipment.id === deliveringShipmentId);

  const revertingDeliveredShipment = shipments.find(
    (shipment) => shipment.id === revertingDeliveredShipmentId
  );

  function closeReturnToInventoryModal() {
    setReturningShipmentItem(null);
  }

  function closeReturnAllToInventoryModal() {
    setReturningShipmentItems(null);
  }

  function closeRequestedUnitsModal() {
    setRequestingShipmentItem(null);
    setRequestedUnitsValue("");
  }

  function closeConsolidationModal() {
    setConsolidatingShipmentItem(null);
  }

  function closeBulkConsolidationModal() {
    setBulkConsolidationCheck(null);
  }

  function confirmBulkConsolidation() {
    if (!bulkConsolidationCheck) {
      return;
    }

    consolidateAllShipmentItems(bulkConsolidationCheck.shipmentId);
    closeBulkConsolidationModal();
  }

  function closeAddSupplyIdsModal() {
    setAddingSupplyIdsShipmentId(null);
    setShipmentSupplyIdsInput("");
  }

  function returnShipmentItemToInventory() {
    if (!returningShipmentItem) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== returningShipmentItem.shipmentId) {
          return shipment;
        }

        return {
          ...shipment,
          items: shipment.items.filter(
            (item) => String(item.id) !== String(returningShipmentItem.shipmentItem.id)
          ),
        };
      })
    );
    closeReturnToInventoryModal();
  }

  function returnAllShipmentItemsToInventory() {
    if (!returningShipmentItems) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) =>
        shipment.id === returningShipmentItems.shipmentId
          ? { ...shipment, items: [] }
          : shipment
      )
    );
    closeReturnAllToInventoryModal();
  }

  function saveRequestedUnits() {
    if (!requestingShipmentItem) {
      return;
    }

    const maxQuantity = Number(requestingShipmentItem.shipmentItem.quantity) || 0;
    const parsedQuantity = Number(requestedUnitsValue);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > maxQuantity) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== requestingShipmentItem.shipmentId) {
          return shipment;
        }

        return {
          ...shipment,
          items: shipment.items.map((item) =>
            String(item.id) === String(requestingShipmentItem.shipmentItem.id)
              ? { ...item, requestedQuantity: parsedQuantity }
              : item
          ),
        };
      })
    );
    closeRequestedUnitsModal();
  }

  function saveConsolidation() {
    if (!consolidatingShipmentItem) {
      return;
    }

    const requestedQuantity = normalizeRequestedQuantity(consolidatingShipmentItem.shipmentItem);
    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== consolidatingShipmentItem.shipmentId) {
          return shipment;
        }

        return withConsolidationCompletionDate({
          ...shipment,
          items: shipment.items.map((item) =>
            String(item.id) === String(consolidatingShipmentItem.shipmentItem.id)
              ? {
                  ...item,
                  isConsolidated: true,
                  consolidationDetails: {
                    consolidatedQuantity: requestedQuantity,
                  },
                }
              : item
          ),
        });
      })
    );
    closeConsolidationModal();
  }

  function addSuppliesToShipmentById() {
    if (!addingSupplyIdsShipmentId) {
      return;
    }

    const shipmentItems = itemsFromSupplyIds(shipmentSupplyIdsInput).map(normalizeShipmentItem);
    if (shipmentItems.length === 0) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== addingSupplyIdsShipmentId) {
          return shipment;
        }

        const existingIds = new Set(shipment.items.map((shipmentItem) => String(shipmentItem.id)));
        const newItems = shipmentItems.filter((item) => !existingIds.has(String(item.id)));

        return {
          ...shipment,
          items: [...shipment.items, ...newItems],
        };
      })
    );
    closeAddSupplyIdsModal();
  }

  function consolidateAllShipmentItems(shipmentId) {
    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== shipmentId) {
          return shipment;
        }

        if (shipment.items.length === 0) {
          return shipment;
        }

        const shouldConsolidate = !shipment.items.every((item) => item.isConsolidated);

        return withConsolidationCompletionDate({
          ...shipment,
          items: shipment.items.map((item) => ({
            ...item,
            isConsolidated: shouldConsolidate,
            consolidationDetails: shouldConsolidate
              ? {
                  exactMatch: true,
                  consolidatedQuantity: normalizeRequestedQuantity(item),
                  varianceReason: "",
                }
              : undefined,
          })),
        });
      })
    );
  }

  function closeRevertToShippedModal() {
    setRevertingDeliveredShipmentId(null);
  }

  function confirmRevertToShipped() {
    if (!revertingDeliveredShipmentId) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) =>
        shipment.id === revertingDeliveredShipmentId
          ? {
              ...shipment,
              pastShipmentStatus: "Shipped",
              pastShipmentStatusOverride: "Shipped",
              pastShipmentStatusManuallySet: true,
            }
          : shipment
      )
    );
    closeRevertToShippedModal();
  }

  function closeDeliveredModal() {
    setDeliveringShipmentId(null);
    setDeliveryDate("");
    setShipmentNotes("");
  }

  function saveDeliveredStatus() {
    if (!deliveringShipmentId || !deliveryDate.trim()) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) =>
        shipment.id === deliveringShipmentId
          ? {
              ...shipment,
              deliveryDate: deliveryDate.trim(),
              shipmentNotes: shipmentNotes.trim(),
              pastShipmentStatus: normalizePastShipmentStatus(undefined, deliveryDate.trim()),
              pastShipmentStatusOverride: "Delivered",
              pastShipmentStatusManuallySet: false,
            }
          : shipment
      )
    );
    closeDeliveredModal();
  }

  const consolidationTargetItem = consolidatingShipmentItem?.shipmentItem || null;

  const consolidationRequestedQuantity = consolidationTargetItem
    ? normalizeRequestedQuantity(consolidationTargetItem)
    : 0;

  const consolidationTotalQuantity = Number(consolidationTargetItem?.quantity) || 0;

  const consolidationRequestNote = consolidationTargetItem
    ? consolidationRequestedQuantity === consolidationTotalQuantity
      ? `Requested all ${formatNumber(consolidationTotalQuantity)} units`
      : `Requested ${formatNumber(consolidationRequestedQuantity)} of ${formatNumber(consolidationTotalQuantity)} units`
    : "";

  return (
    <>
      {returningShipmentItem ? (
        <div className="modal-backdrop" role="presentation" onClick={closeReturnToInventoryModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-to-inventory-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Confirm Return</p>
                <h2 id="return-to-inventory-modal-title">Move supply back to inventory?</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeReturnToInventoryModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                Remove <strong>{returningShipmentItem.shipmentItem.exactSupplyName}</strong> from
                this shipment and move it back to inventory?
              </p>
              <p className="shipment-empty">
                This will remove the item from the shipment and change its status in Total
                Inventory from pulled back to available.
              </p>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeReturnToInventoryModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={returnShipmentItemToInventory}
              >
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {returningShipmentItems ? (
        <div className="modal-backdrop" role="presentation" onClick={closeReturnAllToInventoryModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-all-to-inventory-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Inventory Check</p>
                <h2 id="return-all-to-inventory-modal-title">
                  Send all supplies back to inventory?
                </h2>
              </div>
              <button type="button" className="modal-close" onClick={closeReturnAllToInventoryModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                Return all <strong>{formatNumber(returningShipmentItems.itemCount)} supplies</strong>{" "}
                ({formatNumber(returningShipmentItems.unitCount)} requested units) from{" "}
                <strong>{returningShipmentItems.shipmentName}</strong> to Total Inventory?
              </p>
              <p className="shipment-empty">
                This will empty the shipment and change every included supply from pulled back to
                available in Total Inventory.
              </p>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeReturnAllToInventoryModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={returnAllShipmentItemsToInventory}
              >
                Confirm Return All
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {requestingShipmentItem ? (
        <div className="modal-backdrop" role="presentation" onClick={closeRequestedUnitsModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="requested-units-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Requested Units</p>
                <h2 id="requested-units-modal-title">Adjust requested units</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeRequestedUnitsModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                Choose how many units are being requested for{" "}
                <strong>{requestingShipmentItem.shipmentItem.exactSupplyName}</strong>.
              </p>
              <label className="modal-field">
                <span>Requested Units</span>
                <input
                  type="number"
                  min="1"
                  max={String(requestingShipmentItem.shipmentItem.quantity || 1)}
                  value={requestedUnitsValue}
                  onChange={(event) => setRequestedUnitsValue(event.target.value)}
                />
                <small>
                  Maximum: {formatNumber(requestingShipmentItem.shipmentItem.quantity)} units
                </small>
              </label>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeRequestedUnitsModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveRequestedUnits}
                disabled={
                  !requestedUnitsValue ||
                  Number(requestedUnitsValue) <= 0 ||
                  Number(requestedUnitsValue) >
                    Number(requestingShipmentItem.shipmentItem.quantity || 0)
                }
              >
                Confirm Request
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {consolidatingShipmentItem ? (
        <div className="modal-backdrop" role="presentation" onClick={closeConsolidationModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consolidation-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Consolidation Check</p>
                <h2 id="consolidation-modal-title">
                  Have exactly {formatNumber(consolidationRequestedQuantity)} units been
                  consolidated?
                </h2>
                <p className="modal-helper-note">({consolidationRequestNote})</p>
              </div>
              <button type="button" className="modal-close" onClick={closeConsolidationModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                Click confirm once the requested units for{" "}
                <strong>{consolidatingShipmentItem.shipmentItem.exactSupplyName}</strong> have
                been consolidated.
              </p>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeConsolidationModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveConsolidation}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkConsolidationCheck ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeBulkConsolidationModal}
        >
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-consolidation-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">
                  {bulkConsolidationCheck.shouldConsolidate
                    ? "Consolidation Check"
                    : "Unconsolidation Check"}
                </p>
                <h2 id="bulk-consolidation-modal-title">
                  {bulkConsolidationCheck.shouldConsolidate
                    ? `Have all ${formatNumber(
                        bulkConsolidationCheck.requestedUnitCount
                      )} requested units been consolidated?`
                    : `Unconsolidate all ${formatNumber(
                        bulkConsolidationCheck.itemCount
                      )} supplies?`}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={closeBulkConsolidationModal}
              >
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                {bulkConsolidationCheck.shouldConsolidate
                  ? `Confirm that ${formatNumber(
                      bulkConsolidationCheck.itemCount
                    )} supplies for ${bulkConsolidationCheck.shipmentName} have been consolidated.`
                  : `This will return every supply in ${bulkConsolidationCheck.shipmentName} to an unconsolidated state.`}
              </p>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeBulkConsolidationModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={confirmBulkConsolidation}
              >
                {bulkConsolidationCheck.shouldConsolidate
                  ? "Confirm Consolidation"
                  : "Confirm Unconsolidation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addingSupplyIdsShipmentId ? (
        <div className="modal-backdrop" role="presentation" onClick={closeAddSupplyIdsModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-supply-ids-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Add Supplies</p>
                <h2 id="add-supply-ids-modal-title">Add supplies via ID</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeAddSupplyIdsModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <label className="modal-field">
                <span>Supply IDs</span>
                <input
                  type="text"
                  value={shipmentSupplyIdsInput}
                  onChange={(event) => setShipmentSupplyIdsInput(event.target.value)}
                  placeholder="Paste supply IDs separated by commas"
                />
              </label>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeAddSupplyIdsModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={addSuppliesToShipmentById}
                disabled={!shipmentSupplyIdsInput.trim()}
              >
                Add Supplies
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deliveringShipmentId ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDeliveredModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivered-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Delivered</p>
                <h2 id="delivered-modal-title">Confirm delivered status</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeDeliveredModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                {deliveryDate > todayIsoDate()
                  ? `This shipment is scheduled for delivery on ${deliveryDate}. That date has not been reached yet.`
                  : `Confirm that ${deliveringShipment?.recipientName || "this shipment"} has been delivered.`}
              </p>
              {deliveryDate > todayIsoDate() ? (
                <p className="shipment-empty">
                  Continuing will mark the shipment Delivered early and override the automatic delivery-date status.
                </p>
              ) : null}
              <label className="modal-field">
                <span>Delivery Date</span>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(event) => setDeliveryDate(event.target.value)}
                />
              </label>
              <label className="modal-field">
                <span>Notes</span>
                <textarea
                  value={shipmentNotes}
                  onChange={(event) => setShipmentNotes(event.target.value)}
                  placeholder="Add or update delivery notes"
                />
              </label>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeDeliveredModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveDeliveredStatus}
                disabled={!deliveryDate.trim()}
              >
                Confirm Delivered
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {revertingDeliveredShipmentId ? (
        <div className="modal-backdrop" role="presentation" onClick={closeRevertToShippedModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="revert-to-shipped-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Shipment Status Check</p>
                <h2 id="revert-to-shipped-modal-title">Move this delivery back to Shipped?</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeRevertToShippedModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                Confirm that <strong>{revertingDeliveredShipment?.recipientName || "this shipment"}</strong>{" "}
                was marked Delivered in error.
              </p>
              <p className="shipment-empty">
                Its scheduled delivery date will be retained, but the status will remain Shipped until someone changes it again.
              </p>
            </div>

            <div className="shipment-modal-actions">
              <button type="button" className="secondary-button" onClick={closeRevertToShippedModal}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={confirmRevertToShipped}>
                Confirm Shipped Status
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

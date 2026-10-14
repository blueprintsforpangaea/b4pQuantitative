import { ShipmentDistributionChart, ShipmentExpirationChart } from "../components/ShipmentCharts.jsx";
import { todayIsoDate } from "../lib/dates.js";
import { formatCurrency, formatCurrentShipmentHistoryDate, formatNumber, formatShipmentHistoryDate } from "../lib/format.js";
import { blueprintsRosterNames, getShipmentItemsForDisplay, getShipmentStatus, normalizePastShipmentStatus, normalizeRequestedQuantity, normalizeShipmentType, rankShipmentsBySearch, requestedShipmentItemValue, shipmentStatusDateValue, shipmentTypeOptions, withConsolidationCompletionDate } from "../lib/shipments.js";

export default function Shipments({
  activeShipmentSubtab,
  currentShipmentSearchTerm,
  currentShipmentStatusFilter,
  currentShipmentTypeFilter,
  currentShipments,
  editingShipmentField,
  editingShipmentNotesId,
  editingShipmentNotesValue,
  editingShipmentValue,
  expandedShipmentIds,
  items,
  nonInventoryShipmentLocation,
  nonInventoryShipmentSearch,
  nonInventoryShipments,
  nonInventoryValuationSort,
  openDetailsModal,
  pastShipmentSearchTerm,
  pastShipmentStatusDateFilter,
  pastShipmentTypeFilter,
  pastShipments,
  setActiveShipmentSubtab,
  setAddingSupplyIdsShipmentId,
  setBulkConsolidationCheck,
  setConsolidatingShipmentItem,
  setCurrentShipmentSearchTerm,
  setCurrentShipmentStatusFilter,
  setCurrentShipmentTypeFilter,
  setDeliveringShipmentId,
  setDeliveryDate,
  setDeliveryDateMode,
  setEditingShipmentField,
  setEditingShipmentNotesId,
  setEditingShipmentNotesValue,
  setEditingShipmentValue,
  setExpandedShipmentIds,
  setIsCreateShipmentModalOpen,
  setIsNonInventoryShipmentModalOpen,
  setNewShipmentPointOfContact,
  setNewShipmentRecipientName,
  setNewShipmentRecipientPointOfContact,
  setNewShipmentSupplyIds,
  setNewShipmentType,
  setNonInventoryClinicName,
  setNonInventoryPointOfContact,
  setNonInventoryShipmentDate,
  setNonInventoryShipmentLocation,
  setNonInventoryShipmentSearch,
  setNonInventoryShipmentType,
  setNonInventoryValuation,
  setNonInventoryValuationSort,
  setPastShipmentSearchTerm,
  setPastShipmentStatusDateFilter,
  setPastShipmentTypeFilter,
  setRequestedUnitsValue,
  setRequestingShipmentItem,
  setReturningShipmentItem,
  setReturningShipmentItems,
  setRevertingDeliveredShipmentId,
  setShipmentDate,
  setShipmentNotes,
  setShipmentSupplyIdsInput,
  setShipments,
  setShippingShipmentId,
  setTransportType,
  setTransportTypeOther,
  shipmentNotes,
  shipments,
}) {
  function openCreateShipmentModal() {
    setNewShipmentRecipientName("");
    setNewShipmentType("Local");
    setNewShipmentPointOfContact("");
    setNewShipmentRecipientPointOfContact("");
    setNewShipmentSupplyIds("");
    setIsCreateShipmentModalOpen(true);
  }

  function openNonInventoryShipmentModal() {
    setNonInventoryClinicName("");
    setNonInventoryPointOfContact("");
    setNonInventoryShipmentType("Local");
    setNonInventoryShipmentDate(todayIsoDate());
    setNonInventoryValuation("");
    setIsNonInventoryShipmentModalOpen(true);
  }

  function setShipmentFilterMode(shipmentId, filterMode) {
    setShipments((currentShipments) =>
      currentShipments.map((shipment) =>
        shipment.id === shipmentId
          ? { ...shipment, filterMode }
          : shipment
      )
    );
  }

  function openReturnToInventoryModal(shipmentId, shipmentItem) {
    setReturningShipmentItem({ shipmentId, shipmentItem });
  }

  function openReturnAllToInventoryModal(shipment) {
    setReturningShipmentItems({
      shipmentId: shipment.id,
      shipmentName: shipment.recipientName,
      itemCount: shipment.items.length,
      unitCount: shipment.items.reduce(
        (total, item) => total + normalizeRequestedQuantity(item),
        0
      ),
    });
  }

  function openRequestedUnitsModal(shipmentId, shipmentItem) {
    setRequestingShipmentItem({ shipmentId, shipmentItem });
    setRequestedUnitsValue(
      String(normalizeRequestedQuantity(shipmentItem) || shipmentItem.quantity || 0)
    );
  }

  function openConsolidationModal(shipmentId, shipmentItem) {
    setConsolidatingShipmentItem({ shipmentId, shipmentItem });
  }

  function openBulkConsolidationModal(shipment) {
    const shouldConsolidate = !shipment.items.every((item) => item.isConsolidated);
    setBulkConsolidationCheck({
      shipmentId: shipment.id,
      shipmentName: shipment.recipientName,
      shouldConsolidate,
      itemCount: shipment.items.length,
      requestedUnitCount: shipment.items.reduce(
        (total, item) => total + normalizeRequestedQuantity(item),
        0
      ),
    });
  }

  function openAddSupplyIdsModal(shipmentId) {
    setAddingSupplyIdsShipmentId(shipmentId);
    setShipmentSupplyIdsInput("");
  }

  function startEditingShipmentField(shipmentId, field, value) {
    setEditingShipmentField({ shipmentId, field });
    setEditingShipmentValue(value || "");
  }

  function saveShipmentFieldValue(shipmentId, field, rawValue) {
    const nextValue = typeof rawValue === "string" ? rawValue.trim() : rawValue;

    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== shipmentId) {
          return shipment;
        }

        if (field === "shipmentType") {
          return { ...shipment, shipmentType: normalizeShipmentType(rawValue) };
        }

        if (field === "pointOfContact" && !blueprintsRosterNames.includes(nextValue)) {
          return shipment;
        }

        if (!nextValue) {
          return shipment;
        }

        return { ...shipment, [field]: nextValue };
      })
    );
  }

  function saveEditingShipmentField() {
    if (!editingShipmentField) {
      return;
    }

    saveShipmentFieldValue(
      editingShipmentField.shipmentId,
      editingShipmentField.field,
      editingShipmentValue
    );
    setEditingShipmentField(null);
    setEditingShipmentValue("");
  }

  function cancelEditingShipmentField() {
    setEditingShipmentField(null);
    setEditingShipmentValue("");
  }

  function openShippingModal(shipmentId) {
    setShippingShipmentId(shipmentId);
    setShipmentDate("");
    setTransportType("Car");
    setTransportTypeOther("");
    setDeliveryDate("");
    setDeliveryDateMode("date");
    setShipmentNotes("");
  }

  function unconsolidateShipmentItem(shipmentId, itemId) {
    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== shipmentId) {
          return shipment;
        }

        return withConsolidationCompletionDate({
          ...shipment,
          items: shipment.items.map((item) =>
            String(item.id) === String(itemId)
              ? {
                  ...item,
                  isConsolidated: false,
                  consolidationDetails: undefined,
                }
              : item
          ),
        });
      })
    );
  }

  function toggleShipmentSupplies(shipmentId) {
    setExpandedShipmentIds((currentIds) =>
      currentIds.includes(shipmentId)
        ? currentIds.filter((currentId) => currentId !== shipmentId)
        : [...currentIds, shipmentId]
    );
  }

  function updatePastShipmentStatus(shipmentId, nextStatus) {
    if (nextStatus === "Delivered") {
      const targetShipment = shipments.find((shipment) => shipment.id === shipmentId);
      setDeliveringShipmentId(shipmentId);
      setDeliveryDate(
        targetShipment?.deliveryDate && targetShipment.deliveryDate !== "TBD"
          ? targetShipment.deliveryDate
          : ""
      );
      setShipmentNotes(targetShipment?.shipmentNotes || "");
      return;
    }

    setRevertingDeliveredShipmentId(shipmentId);
  }

  function startEditingShipmentNotes(shipmentId, currentNotes) {
    setEditingShipmentNotesId(shipmentId);
    setEditingShipmentNotesValue(currentNotes || "");
  }

  function cancelEditingShipmentNotes() {
    setEditingShipmentNotesId(null);
    setEditingShipmentNotesValue("");
  }

  function saveEditingShipmentNotes() {
    if (!editingShipmentNotesId) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) =>
        shipment.id === editingShipmentNotesId
          ? { ...shipment, shipmentNotes: editingShipmentNotesValue.trim() }
          : shipment
      )
    );
    cancelEditingShipmentNotes();
  }

  const normalizedCurrentShipmentSearch = currentShipmentSearchTerm.trim().toLowerCase();

  const normalizedPastShipmentSearch = pastShipmentSearchTerm.trim().toLowerCase();

  const currentShipmentRequestMap = currentShipments.reduce((accumulator, shipment) => {
    shipment.items.forEach((item) => {
      const supplyId = String(item.supplyId || item.id || "");
      if (!supplyId) {
        return;
      }

      if (!accumulator[supplyId]) {
        accumulator[supplyId] = [];
      }

      accumulator[supplyId].push({
        shipmentId: shipment.id,
        shipmentName: shipment.recipientName || "Unnamed shipment",
        requestedQuantity: normalizeRequestedQuantity(item),
      });
    });

    return accumulator;
  }, {});

  const rankedShipments = rankShipmentsBySearch(currentShipments, normalizedCurrentShipmentSearch);

  const filteredCurrentShipments = rankedShipments.filter((shipment) => {
    const matchesType =
      currentShipmentTypeFilter === "All" ||
      normalizeShipmentType(shipment.shipmentType) === currentShipmentTypeFilter;
    const matchesStatus =
      currentShipmentStatusFilter === "All" ||
      getShipmentStatus(shipment) === currentShipmentStatusFilter;

    return matchesType && matchesStatus;
  });

  const normalizedNonInventorySearch = nonInventoryShipmentSearch.trim().toLowerCase();

  const filteredNonInventoryShipments = nonInventoryShipments
    .filter((shipment) => {
      const matchesName =
        !normalizedNonInventorySearch ||
        shipment.clinicName.toLowerCase().includes(normalizedNonInventorySearch);
      const matchesLocation =
        nonInventoryShipmentLocation === "All" ||
        normalizeShipmentType(shipment.shipmentType) === nonInventoryShipmentLocation;

      return matchesName && matchesLocation;
    })
    .sort((left, right) =>
      nonInventoryValuationSort === "low-high"
        ? Number(left.valuation) - Number(right.valuation)
        : Number(right.valuation) - Number(left.valuation)
    );

  const rankedPastShipments = rankShipmentsBySearch(pastShipments, normalizedPastShipmentSearch);

  const filteredPastShipments = rankedPastShipments
    .filter((shipment) =>
      pastShipmentTypeFilter === "All"
        ? true
        : normalizeShipmentType(shipment.shipmentType) === pastShipmentTypeFilter
    )
    .sort(
      (left, right) =>
        shipmentStatusDateValue(right, pastShipmentStatusDateFilter) -
        shipmentStatusDateValue(left, pastShipmentStatusDateFilter)
    );

  return (
    <section className="panel empty-panel">
      <div className="shipment-subtabs" role="tablist" aria-label="Shipment subviews">
        <button
          type="button"
          className={
            activeShipmentSubtab === "current"
              ? "shipment-subtab active"
              : "shipment-subtab"
          }
          onClick={() => setActiveShipmentSubtab("current")}
        >
          Current Shipments
        </button>
        <button
          type="button"
          className={
            activeShipmentSubtab === "non-inventory"
              ? "shipment-subtab active"
              : "shipment-subtab"
          }
          onClick={() => setActiveShipmentSubtab("non-inventory")}
        >
          Non-Inventory Shipments
        </button>
        <button
          type="button"
          className={
            activeShipmentSubtab === "past"
              ? "shipment-subtab active"
              : "shipment-subtab"
          }
          onClick={() => setActiveShipmentSubtab("past")}
        >
          Past Shipments
        </button>
      </div>

      {activeShipmentSubtab === "current" ? (
        <div className="shipment-subpanel">
          <p className="section-label">Current Shipments</p>
          <div className="create-shipment-bar create-shipment-bar-filtered">
            <input
              className="search-input"
              type="text"
              value={currentShipmentSearchTerm}
              onChange={(event) => setCurrentShipmentSearchTerm(event.target.value)}
              placeholder="Search shipments, supply IDs, supplies, or manufacturers"
            />
            <select
              className="shipment-filter-select"
              value={currentShipmentTypeFilter}
              onChange={(event) => setCurrentShipmentTypeFilter(event.target.value)}
            >
              <option value="All">Shipment type: All</option>
              <option value="Local">Shipment type: Local</option>
              <option value="International">Shipment type: International</option>
            </select>
            <select
              className="shipment-filter-select"
              value={currentShipmentStatusFilter}
              onChange={(event) => setCurrentShipmentStatusFilter(event.target.value)}
            >
              <option value="All">Status: All</option>
              <option value="Planning">Status: Planning</option>
              <option value="Consolidating">Status: Consolidating</option>
              <option value="Consolidation Complete">Status: Consolidated</option>
            </select>
            <button
              type="button"
              className="primary-button"
              onClick={openCreateShipmentModal}
            >
              Create New Shipment
            </button>
          </div>
          {filteredCurrentShipments.length === 0 ? (
            <p>
              {currentShipments.length === 0
                ? "No current shipments yet."
                : "No shipments matched those filters."}
            </p>
          ) : (
            <div className="shipment-list">
              {filteredCurrentShipments.map((shipment) => (
                <article
                  key={shipment.id}
                  className={`shipment-card shipment-card-${getShipmentStatus(shipment).toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {(() => {
                    const shipmentValuation = shipment.items.reduce(
                      (total, item) => total + requestedShipmentItemValue(item),
                      0
                    );

                    return (
                  <div className="shipment-card-header">
                    <div className="shipment-card-left-column">
                      <div className="shipment-card-title">
                        <div className="shipment-inline-edit">
                          {editingShipmentField?.shipmentId === shipment.id &&
                          editingShipmentField?.field === "recipientName" ? (
                            <input
                              className="shipment-inline-input"
                              type="text"
                              value={editingShipmentValue}
                              placeholder="Enter recipient name"
                              onChange={(event) => setEditingShipmentValue(event.target.value)}
                              onBlur={saveEditingShipmentField}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  saveEditingShipmentField();
                                }
                                if (event.key === "Escape") {
                                  cancelEditingShipmentField();
                                }
                              }}
                              autoFocus
                            />
                          ) : (
                            <h3>{shipment.recipientName}</h3>
                          )}
                          <button
                            type="button"
                            className="edit-icon-button"
                            aria-label={`Edit name for ${shipment.recipientName}`}
                            onClick={() =>
                              startEditingShipmentField(
                                shipment.id,
                                "recipientName",
                                shipment.recipientName
                              )
                            }
                          >
                            ✎
                          </button>
                        </div>
                        <p className="shipment-card-subline">
                          {formatNumber(shipment.items.length)} assigned items
                        </p>
                        <p className="shipment-card-subline shipment-card-valuation">
                          {formatCurrency(shipmentValuation)} valuation
                        </p>
                        <div className="shipment-inline-edit shipment-card-subline shipment-inline-field">
                          <span className="shipment-inline-label">Type:</span>
                          {editingShipmentField?.shipmentId === shipment.id &&
                          editingShipmentField?.field === "shipmentType" ? (
                            <select
                              className="shipment-inline-select"
                              value={editingShipmentValue}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setEditingShipmentValue(nextValue);
                                saveShipmentFieldValue(
                                  shipment.id,
                                  "shipmentType",
                                  nextValue
                                );
                                setEditingShipmentField(null);
                                setEditingShipmentValue("");
                              }}
                              onBlur={cancelEditingShipmentField}
                              autoFocus
                            >
                              {shipmentTypeOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          ) : (
                            <span>{shipment.shipmentType || "No shipment type"}</span>
                          )}
                          <button
                            type="button"
                            className="edit-icon-button"
                            aria-label={`Edit shipment type for ${shipment.recipientName}`}
                            onClick={() =>
                              startEditingShipmentField(
                                shipment.id,
                                "shipmentType",
                                shipment.shipmentType || "Local"
                              )
                            }
                          >
                            ✎
                          </button>
                        </div>
                        <div className="shipment-inline-edit shipment-card-subline shipment-inline-field">
                          <span className="shipment-inline-label">Blueprints PoC:</span>
                          {editingShipmentField?.shipmentId === shipment.id &&
                          editingShipmentField?.field === "pointOfContact" ? (
                            <select
                              className="shipment-inline-select"
                              value={editingShipmentValue}
                              title="Select a Blueprints point of contact"
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setEditingShipmentValue(nextValue);
                                saveShipmentFieldValue(
                                  shipment.id,
                                  "pointOfContact",
                                  nextValue
                                );
                                setEditingShipmentField(null);
                                setEditingShipmentValue("");
                              }}
                              onBlur={cancelEditingShipmentField}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  cancelEditingShipmentField();
                                }
                              }}
                              autoFocus
                            >
                              <option value="" disabled>Select roster member</option>
                              {blueprintsRosterNames.map((name) => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </select>
                          ) : (
                            <span>{shipment.pointOfContact || "No point of contact"}</span>
                          )}
                          <button
                            type="button"
                            className="edit-icon-button"
                            aria-label={`Edit point of contact for ${shipment.recipientName}`}
                            onClick={() =>
                              startEditingShipmentField(
                                shipment.id,
                                "pointOfContact",
                                shipment.pointOfContact
                              )
                            }
                          >
                            ✎
                          </button>
                        </div>
                        <div className="shipment-inline-edit shipment-card-subline shipment-inline-field">
                          <span className="shipment-inline-label">Recipient PoC:</span>
                          {editingShipmentField?.shipmentId === shipment.id &&
                          editingShipmentField?.field === "recipientPointOfContact" ? (
                            <input
                              className="shipment-inline-input"
                              type="text"
                              value={editingShipmentValue}
                              onChange={(event) => setEditingShipmentValue(event.target.value)}
                              onBlur={saveEditingShipmentField}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") saveEditingShipmentField();
                                if (event.key === "Escape") cancelEditingShipmentField();
                              }}
                              autoFocus
                            />
                          ) : (
                            <span>{shipment.recipientPointOfContact || "TBD"}</span>
                          )}
                          <button
                            type="button"
                            className="edit-icon-button"
                            aria-label={`Edit recipient point of contact for ${shipment.recipientName}`}
                            onClick={() =>
                              startEditingShipmentField(
                                shipment.id,
                                "recipientPointOfContact",
                                shipment.recipientPointOfContact || "TBD"
                              )
                            }
                          >
                            &#9998;
                          </button>
                        </div>
                      </div>
                      <div className="shipment-bottom-left-stack">
                        <div className="shipment-history-column shipment-history-column-current">
                          <span className="shipment-status-label">Shipment History</span>
                          <div className="shipment-history-list">
                            <span>Created: {formatCurrentShipmentHistoryDate(shipment.createdAt)}</span>
                            <span>
                              Consolidating start:{" "}
                              {formatCurrentShipmentHistoryDate(shipment.consolidationStartedAt)}
                            </span>
                            <span>
                              Consolidation complete:{" "}
                              {formatCurrentShipmentHistoryDate(shipment.consolidationCompletedAt)}
                            </span>
                          </div>
                        </div>
                        <div className="shipment-notes-panel shipment-notes-panel-current">
                          <span className="shipment-status-label">Shipment Notes</span>
                          {editingShipmentNotesId === shipment.id ? (
                            <textarea
                              className="shipment-notes-editor"
                              value={editingShipmentNotesValue}
                              onChange={(event) => setEditingShipmentNotesValue(event.target.value)}
                              onBlur={saveEditingShipmentNotes}
                              onKeyDown={(event) => {
                                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                  saveEditingShipmentNotes();
                                }
                                if (event.key === "Escape") {
                                  cancelEditingShipmentNotes();
                                }
                              }}
                              placeholder="Add shipment notes"
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              className="shipment-notes-copy"
                              onClick={() =>
                                startEditingShipmentNotes(shipment.id, shipment.shipmentNotes)
                              }
                            >
                              {shipment.shipmentNotes || "No shipment notes recorded."}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="shipment-status-panel">
                      <div className="shipment-status-column">
                        <span className="shipment-status-label">Shipment Status</span>
                        <span className="shipment-status-badge">
                          {getShipmentStatus(shipment)}
                        </span>
                      </div>
                    </div>
                    <div className="shipment-chart-cluster">
                      <ShipmentDistributionChart shipmentItems={shipment.items} />
                      <ShipmentExpirationChart shipmentItems={shipment.items} />
                    </div>
                    <div className="shipment-card-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => toggleShipmentSupplies(shipment.id)}
                      >
                        {expandedShipmentIds.includes(shipment.id)
                          ? "Hide Supplies"
                          : "Show Supplies"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openAddSupplyIdsModal(shipment.id)}
                      >
                        Add Supplies via ID
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openBulkConsolidationModal(shipment)}
                        disabled={shipment.items.length === 0}
                      >
                        {shipment.items.length > 0 &&
                        shipment.items.every((item) => item.isConsolidated)
                          ? "Unconsolidate All"
                          : "Consolidate All"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openReturnAllToInventoryModal(shipment)}
                        disabled={shipment.items.length === 0}
                      >
                        Back All to Inventory
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => openShippingModal(shipment.id)}
                        disabled={
                          getShipmentStatus(shipment) !==
                          "Consolidation Complete"
                        }
                      >
                        Mark as Shipped
                      </button>
                    </div>
                  </div>
                    );
                  })()}

                  {shipment.items.length === 0 ? (
                    <p className="shipment-empty">No items have been added yet.</p>
                  ) : expandedShipmentIds.includes(shipment.id) ? (
                    <div className="shipment-line-items">
                      <div className="shipment-line-items-filter-bar">
                        <span className="shipment-filter-label">Filter Supplies</span>
                        <div className="shipment-filter-buttons">
                          <button
                            type="button"
                            className={
                              (shipment.filterMode || "original") === "original"
                                ? "secondary-button filter-toggle-button is-active"
                                : "secondary-button filter-toggle-button"
                            }
                            onClick={() => setShipmentFilterMode(shipment.id, "original")}
                          >
                            Use Add Order Filter
                          </button>
                          <button
                            type="button"
                            className={
                              shipment.filterMode === "location"
                                ? "secondary-button filter-toggle-button is-active"
                                : "secondary-button filter-toggle-button"
                            }
                            onClick={() => setShipmentFilterMode(shipment.id, "location")}
                          >
                            Use Location Filter
                          </button>
                          <button
                            type="button"
                            className={
                              shipment.filterMode === "expiration"
                                ? "secondary-button filter-toggle-button is-active"
                                : "secondary-button filter-toggle-button"
                            }
                            onClick={() => setShipmentFilterMode(shipment.id, "expiration")}
                          >
                            Use Expiration Filter
                          </button>
                        </div>
                      </div>
                      {getShipmentItemsForDisplay(shipment).map((shipmentItem) => {
                        const requestedQuantity = normalizeRequestedQuantity(shipmentItem);
                        const isRequestingAllUnits =
                          requestedQuantity === (Number(shipmentItem.quantity) || 0);
                        const otherShipmentRequests = (
                          currentShipmentRequestMap[String(shipmentItem.supplyId || shipmentItem.id)] || []
                        ).filter((request) => request.shipmentId !== shipment.id);
                        const requestConflictLabel = otherShipmentRequests
                          .map(
                            (request) =>
                              `${formatNumber(request.requestedQuantity)} units also requested by ${request.shipmentName}`
                          )
                          .join(" • ");

                        return (
                          <div
                            key={shipmentItem.id}
                            className={[
                              "shipment-line-item",
                              shipmentItem.isConsolidated ? "is-consolidated" : "",
                              otherShipmentRequests.length > 0 ? "is-conflicted" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            <div className="shipment-line-top">
                              <div className="shipment-item-id-row">
                                <strong>#{shipmentItem.supplyId}</strong>
                                <button
                                  type="button"
                                  className="info-icon-button"
                                  onClick={() => openDetailsModal(shipmentItem)}
                                  aria-label={`Open details for supply ${shipmentItem.supplyId}`}
                                >
                                  ⓘ
                                </button>
                                <span>{shipmentItem.exactSupplyName}</span>
                              </div>
                              <div className="shipment-line-middle">
                                <strong>{shipmentItem.locationInfo}</strong>
                                <strong>{formatNumber(shipmentItem.quantity)} units</strong>
                              <button
                                type="button"
                                className={
                                  isRequestingAllUnits
                                    ? "requested-units-button"
                                      : "requested-units-button is-partial"
                                  }
                                  onClick={() =>
                                    openRequestedUnitsModal(shipment.id, shipmentItem)
                                  }
                                >
                                {isRequestingAllUnits
                                  ? "Requested All Units"
                                  : `Requested ${formatNumber(requestedQuantity)} Units`}
                              </button>
                              {otherShipmentRequests.length > 0 ? (
                                <span className="shipment-request-conflict">
                                  {requestConflictLabel}
                                </span>
                              ) : null}
                            </div>
                              <div className="shipment-line-pricing">
                                <span>{formatCurrency(shipmentItem.unitPrice)} per unit</span>
                                <span>{formatCurrency(requestedShipmentItemValue(shipmentItem))} total</span>
                              </div>
                              <div className="shipment-expiration">
                                <span>{shipmentItem.expirationDate}</span>
                                <span
                                  className={`expiration-pill ${shipmentItem.expirationStatus.tone}`}
                                >
                                  {shipmentItem.expirationStatus.label}
                                </span>
                              </div>
                              <div className="shipment-line-actions">
                              <button
                                type="button"
                                className={
                                  shipmentItem.isConsolidated
                                    ? "consolidated-button is-consolidated"
                                    : "consolidated-button"
                                }
                                onClick={() =>
                                  shipmentItem.isConsolidated
                                    ? unconsolidateShipmentItem(shipment.id, shipmentItem.id)
                                    : openConsolidationModal(shipment.id, shipmentItem)
                                }
                              >
                                {shipmentItem.isConsolidated ? "Unconsolidate" : "Consolidate"}
                              </button>
                                <button
                                  type="button"
                                  className="secondary-button shipment-return-button"
                                  onClick={() =>
                                    openReturnToInventoryModal(shipment.id, shipmentItem)
                                  }
                                >
                                  Back to Inventory
                                </button>
                              </div>
                            </div>
                            <div className="shipment-line-meta">
                              <span>{shipmentItem.generalSupply}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {activeShipmentSubtab === "non-inventory" ? (
        <div className="shipment-subpanel">
          <section className="non-inventory-shipments-section">
            <div className="non-inventory-shipments-heading">
              <div>
                <p className="section-label">Non-Inventory Shipments</p>
                <h3>Document shipments outside inventory</h3>
              </div>
              <div className="non-inventory-heading-actions">
                <span>{nonInventoryShipments.length} documented</span>
                <button
                  type="button"
                  className="primary-button"
                  onClick={openNonInventoryShipmentModal}
                >
                  Create Non-Inventory Shipment
                </button>
              </div>
            </div>
            <div className="create-shipment-bar non-inventory-filter-bar">
              <input
                className="search-input"
                type="text"
                value={nonInventoryShipmentSearch}
                onChange={(event) => setNonInventoryShipmentSearch(event.target.value)}
                placeholder="Search shipment or clinic names"
              />
              <select
                className="shipment-filter-select"
                value={nonInventoryShipmentLocation}
                onChange={(event) => setNonInventoryShipmentLocation(event.target.value)}
              >
                <option value="All">Location: All</option>
                <option value="Local">Location: Local</option>
                <option value="International">Location: International</option>
              </select>
              <select
                className="shipment-filter-select"
                value={nonInventoryValuationSort}
                onChange={(event) => setNonInventoryValuationSort(event.target.value)}
              >
                <option value="high-low">Valuation: Highest to Lowest</option>
                <option value="low-high">Valuation: Lowest to Highest</option>
              </select>
            </div>
            {filteredNonInventoryShipments.length === 0 ? (
              <p className="non-inventory-empty">
                {nonInventoryShipments.length === 0
                  ? "No non-inventory shipments have been documented yet."
                  : "No non-inventory shipments matched those filters."}
              </p>
            ) : (
              <div className="non-inventory-shipment-list">
                {filteredNonInventoryShipments.map((shipment) => (
                  <article className="non-inventory-shipment-card" key={shipment.id}>
                    <div className="non-inventory-shipment-card-title">
                      <p className="section-label">Non-Inventory Shipment</p>
                      <h3>{shipment.clinicName}</h3>
                    </div>
                    <dl className="non-inventory-shipment-details">
                      <div>
                        <dt>Blueprints Point of Contact</dt>
                        <dd>{shipment.pointOfContact}</dd>
                      </div>
                      <div>
                        <dt>Shipment Type</dt>
                        <dd>{shipment.shipmentType}</dd>
                      </div>
                      <div>
                        <dt>Date Shipped</dt>
                        <dd>{shipment.shippedAt || "Not recorded"}</dd>
                      </div>
                      <div>
                        <dt>Valuation</dt>
                        <dd>{formatCurrency(shipment.valuation)}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {activeShipmentSubtab === "past" ? (
        <div className="shipment-subpanel">
          <p className="section-label">Past Shipments</p>
          <div className="create-shipment-bar create-shipment-bar-past">
            <input
              className="search-input"
              type="text"
              value={pastShipmentSearchTerm}
              onChange={(event) => setPastShipmentSearchTerm(event.target.value)}
              placeholder="Search shipments, supply IDs, supplies, or manufacturers"
            />
            <select
              className="shipment-filter-select"
              value={pastShipmentTypeFilter}
              onChange={(event) => setPastShipmentTypeFilter(event.target.value)}
            >
              <option value="All">Shipment type: All</option>
              <option value="Local">Shipment type: Local</option>
              <option value="International">Shipment type: International</option>
            </select>
            <select
              className="shipment-filter-select"
              value={pastShipmentStatusDateFilter}
              onChange={(event) => setPastShipmentStatusDateFilter(event.target.value)}
            >
              <option value="creation">Status date: Creation</option>
              <option value="consolidation">Status date: Consolidation</option>
              <option value="ship">Status date: Ship</option>
              <option value="delivery">Status date: Delivery</option>
            </select>
          </div>
          {filteredPastShipments.length === 0 ? (
            <p>
              {normalizedPastShipmentSearch || pastShipmentTypeFilter !== "All"
                ? "No past shipments matched those filters."
                : "No past shipments yet."}
            </p>
          ) : (
            <div className="shipment-list">
              {filteredPastShipments.map((shipment) => {
                const shipmentValuation = shipment.items.reduce(
                  (total, item) => total + requestedShipmentItemValue(item),
                  0
                );
                const pastShipmentStatus = normalizePastShipmentStatus(
                  shipment.pastShipmentStatus,
                  shipment.deliveryDate,
                  shipment.pastShipmentStatusOverride ||
                    (shipment.pastShipmentStatusManuallySet ? "Shipped" : "")
                );

                return (
                  <article
                    key={shipment.id}
                    id={`past-shipment-${shipment.id}`}
                    className={
                      pastShipmentStatus === "Delivered"
                        ? "shipment-card shipment-card-complete shipment-card-delivered"
                        : "shipment-card shipment-card-past"
                    }
                  >
                    <div className="shipment-card-header">
                      <div className="shipment-card-title">
                        <h3>{shipment.recipientName}</h3>
                        <p className="shipment-card-subline">
                          {formatNumber(shipment.items.length)} assigned items
                        </p>
                        <p className="shipment-card-subline shipment-card-valuation">
                          {formatCurrency(shipmentValuation)} valuation
                        </p>
                      </div>
                      <div className="shipment-history-column">
                        <span className="shipment-status-label">Shipment Details</span>
                        <div className="shipment-history-list">
                          <span>{shipment.shipmentType || "Not set"}</span>
                          <span>Blueprints PoC: {shipment.pointOfContact || "Not set"}</span>
                          <span>Recipient PoC: {shipment.recipientPointOfContact || "TBD"}</span>
                          <span>{shipment.transportType || "Method not set"}</span>
                        </div>
                      </div>
                      <div className="shipment-history-column">
                        <span className="shipment-status-label">Shipment History</span>
                        <div className="shipment-history-list">
                          <span>Created: {formatShipmentHistoryDate(shipment.createdAt)}</span>
                          <span>
                            Consolidating start:{" "}
                            {formatShipmentHistoryDate(shipment.consolidationStartedAt)}
                          </span>
                          <span>
                            Consolidated: {formatShipmentHistoryDate(shipment.consolidationCompletedAt)}
                          </span>
                          <span>Shipped: {formatShipmentHistoryDate(shipment.shippedAt)}</span>
                          <span>Delivered: {formatShipmentHistoryDate(shipment.deliveryDate)}</span>
                        </div>
                      </div>
                      <div className="shipment-chart-cluster">
                        <ShipmentDistributionChart shipmentItems={shipment.items} />
                        <ShipmentExpirationChart shipmentItems={shipment.items} />
                      </div>
                      <div className="shipment-status-panel shipment-status-panel-past">
                        <div className="shipment-status-column">
                          <span className="shipment-status-label">Shipment Status</span>
                          <select
                            className={
                              pastShipmentStatus === "Delivered"
                                ? "shipment-status-select shipment-status-select-delivered"
                                : "shipment-status-select"
                            }
                            value={pastShipmentStatus}
                            title="Change shipment status between Shipped and Delivered"
                            onChange={(event) =>
                              updatePastShipmentStatus(shipment.id, event.target.value)
                            }
                          >
                            <option
                              value="Shipped"
                              title="Mark this shipment as shipped but not yet delivered"
                            >
                              Shipped
                            </option>
                            <option
                              value="Delivered"
                              title="Mark this shipment as delivered to the recipient"
                            >
                              Delivered
                            </option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="shipment-notes-panel">
                      <span className="shipment-status-label">Shipment Notes</span>
                      {editingShipmentNotesId === shipment.id ? (
                        <textarea
                          className="shipment-notes-editor"
                          value={editingShipmentNotesValue}
                          onChange={(event) => setEditingShipmentNotesValue(event.target.value)}
                          onBlur={saveEditingShipmentNotes}
                          onKeyDown={(event) => {
                            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                              saveEditingShipmentNotes();
                            }
                            if (event.key === "Escape") {
                              cancelEditingShipmentNotes();
                            }
                          }}
                          placeholder="Add shipment notes"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          className="shipment-notes-copy"
                          onClick={() =>
                            startEditingShipmentNotes(shipment.id, shipment.shipmentNotes)
                          }
                        >
                          {shipment.shipmentNotes || "No shipment notes recorded."}
                        </button>
                      )}
                    </div>
                    <div className="shipment-card-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => toggleShipmentSupplies(shipment.id)}
                      >
                        {expandedShipmentIds.includes(shipment.id)
                          ? "Hide Supplies"
                          : "Show Supplies"}
                      </button>
                    </div>
                    {shipment.items.length > 0 && expandedShipmentIds.includes(shipment.id) ? (
                      <div className="shipment-line-items">
                        {shipment.items.map((shipmentItem) => {
                          const requestedQuantity = normalizeRequestedQuantity(shipmentItem);
                          const isRequestingAllUnits =
                            requestedQuantity === (Number(shipmentItem.quantity) || 0);

                          return (
                            <div key={shipmentItem.id} className="shipment-line-item">
                              <div className="shipment-line-top shipment-line-top-past">
                                <div className="shipment-item-id-row">
                                  <strong>#{shipmentItem.supplyId}</strong>
                                  <button
                                    type="button"
                                    className="info-icon-button"
                                    onClick={() => openDetailsModal(shipmentItem)}
                                    aria-label={`Open details for supply ${shipmentItem.supplyId}`}
                                  >
                                    ⓘ
                                  </button>
                                  <span>{shipmentItem.exactSupplyName}</span>
                                </div>
                                <div className="shipment-line-middle">
                                  <strong>{shipmentItem.locationInfo}</strong>
                                  <strong>{formatNumber(shipmentItem.quantity)} units</strong>
                                  <span className="shipment-request-summary">
                                    {isRequestingAllUnits
                                      ? `Requested all ${formatNumber(shipmentItem.quantity)} units`
                                      : `Requested ${formatNumber(requestedQuantity)} of ${formatNumber(shipmentItem.quantity)} units`}
                                  </span>
                                </div>
                                <div className="shipment-line-pricing">
                                  <span>{formatCurrency(shipmentItem.unitPrice)} per unit</span>
                                  <span>{formatCurrency(requestedShipmentItemValue(shipmentItem))} total</span>
                                </div>
                                <div className="shipment-expiration">
                                  <span>{shipmentItem.expirationDate}</span>
                                  <span
                                    className={`expiration-pill ${shipmentItem.expirationStatus.tone}`}
                                  >
                                    {shipmentItem.expirationStatus.label}
                                  </span>
                                </div>
                              </div>
                              <div className="shipment-line-meta">
                                <span>{shipmentItem.generalSupply}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

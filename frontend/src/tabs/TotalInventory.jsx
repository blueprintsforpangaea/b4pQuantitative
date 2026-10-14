import { durationBucketOrder, supplyStatusOrder } from "../lib/colors.js";
import { formatCurrency, formatNumber } from "../lib/format.js";
import { buildFacetCounts } from "../lib/inventory.js";

export default function TotalInventory({
  clearInventoryFilters,
  currentShipments,
  inventoryRowsWithShipmentStatus,
  inventoryRowsWithStatus,
  inventoryShipmentButtonRef,
  isInventoryFiltersOpen,
  items,
  maxUnitPrice,
  minUnitPrice,
  openDetailsModal,
  searchTerm,
  selectedBoxTypes,
  selectedCategories,
  selectedDuration,
  selectedExpiration,
  selectedInventoryIds,
  selectedPallets,
  selectedWorkflowStatuses,
  setIsInventoryFiltersOpen,
  setIsShipmentModalOpen,
  setNewShipmentPointOfContact,
  setNewShipmentRecipientName,
  setNewShipmentRecipientPointOfContact,
  setNewShipmentSupplyIds,
  setNewShipmentType,
  setPendingShipmentItems,
  setSearchTerm,
  setSelectedBoxTypes,
  setSelectedCategories,
  setSelectedDuration,
  setSelectedExpiration,
  setSelectedInventoryIds,
  setSelectedPallets,
  setSelectedShipmentId,
  setSelectedWorkflowStatuses,
  setShowAvailableItems,
  setShowNonAvailableItems,
  setValuationRange,
  showAvailableItems,
  showFloatingInventoryAction,
  showNonAvailableItems,
  valuationRange,
}) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const expirationOptions = buildFacetCounts(inventoryRowsWithStatus, "expirationFilter", [
    "Already expired",
    "0-90 days",
    "90-180 days",
    "180-365 days",
    "365+ days",
    "No expiration date",
  ]);

  const durationOptions = buildFacetCounts(
    inventoryRowsWithStatus.filter((row) => row.durationFilter !== "Unknown duration"),
    "durationFilter",
    durationBucketOrder
  );

  const categoryOptions = buildFacetCounts(inventoryRowsWithStatus, "category");

  const palletOptions = buildFacetCounts(inventoryRowsWithStatus, "palletNumber").sort(
    (left, right) => {
      const leftNumber = Number(left.value);
      const rightNumber = Number(right.value);

      if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
        return leftNumber - rightNumber;
      }

      return left.value.localeCompare(right.value);
    }
  );

  const boxTypeOptions = buildFacetCounts(inventoryRowsWithStatus, "boxType");

  const workflowStatusOptions = buildFacetCounts(
    inventoryRowsWithShipmentStatus,
    "supplyWorkflowStatus",
    supplyStatusOrder
  );

  function matchesSelectedFilter(selectedValues, rowValue) {
    return selectedValues.length === 0 || selectedValues.includes(rowValue);
  }

  function toggleFilter(setter, currentValues, value) {
    setter(
      currentValues.includes(value)
        ? currentValues.filter((entry) => entry !== value)
        : [...currentValues, value]
    );
  }

  function openShipmentModal(selectedItems) {
    if (selectedItems.length === 0) {
      return;
    }

    setPendingShipmentItems(selectedItems);
    setSelectedShipmentId(currentShipments[0]?.id || "__new__");
    setNewShipmentRecipientName("");
    setNewShipmentType("Local");
    setNewShipmentPointOfContact("");
    setNewShipmentRecipientPointOfContact("");
    setNewShipmentSupplyIds("");
    setIsShipmentModalOpen(true);
  }

  function toggleInventorySelection(item) {
    if (item.inventoryStatus !== "Available") {
      return;
    }

    setSelectedInventoryIds((currentIds) =>
      currentIds.includes(item.id)
        ? currentIds.filter((currentId) => currentId !== item.id)
        : [...currentIds, item.id]
    );
  }

  function toggleSelectAllFiltered() {
    const filteredIds = filteredInventoryRows
      .filter((row) => row.inventoryStatus === "Available")
      .map((row) => row.id);
    const allSelected =
      filteredIds.length > 0 && filteredIds.every((id) => selectedInventoryIds.includes(id));

    setSelectedInventoryIds((currentIds) => {
      if (allSelected) {
        return currentIds.filter((id) => !filteredIds.includes(id));
      }

      return [...new Set([...currentIds, ...filteredIds])];
    });
  }

  const filteredInventoryRows = inventoryRowsWithShipmentStatus.filter((row) => {
    const matchesSearch =
      !normalizedSearch ||
      [row.generalSupply, row.exactSupplyName, row.manufacturer].some((value) =>
        value.toLowerCase().includes(normalizedSearch)
      );

    return (
      matchesSearch &&
      row.unitPrice >= valuationRange.min &&
      row.unitPrice <= valuationRange.max &&
      (!showAvailableItems || row.inventoryStatus === "Available") &&
      (!showNonAvailableItems || row.inventoryStatus !== "Available") &&
      matchesSelectedFilter(selectedPallets, row.palletNumber) &&
      matchesSelectedFilter(selectedBoxTypes, row.boxType) &&
      matchesSelectedFilter(selectedExpiration, row.expirationFilter) &&
      matchesSelectedFilter(selectedDuration, row.durationFilter) &&
      matchesSelectedFilter(selectedCategories, row.category) &&
      matchesSelectedFilter(selectedWorkflowStatuses, row.supplyWorkflowStatus)
    );
  });

  const selectableFilteredInventoryRows = filteredInventoryRows.filter(
    (row) => row.inventoryStatus === "Available"
  );

  const selectedInventoryItems = selectableFilteredInventoryRows.filter((row) =>
    selectedInventoryIds.includes(row.id)
  );

  const hasActiveInventoryFilters =
    searchTerm.trim().length > 0 ||
    selectedExpiration.length > 0 ||
    selectedDuration.length > 0 ||
    selectedCategories.length > 0 ||
    selectedPallets.length > 0 ||
    selectedBoxTypes.length > 0 ||
    selectedWorkflowStatuses.length > 0 ||
    showAvailableItems ||
    showNonAvailableItems ||
    valuationRange.min !== minUnitPrice ||
    valuationRange.max !== maxUnitPrice;

  const allFilteredSelected =
    selectableFilteredInventoryRows.length > 0 &&
    selectableFilteredInventoryRows.every((row) => selectedInventoryIds.includes(row.id));

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="section-label">Total Inventory</p>
          <h2>Every supply as a line item</h2>
        </div>
        <div className="inventory-actions">
          <button
            type="button"
            className="secondary-button inventory-filter-button"
            onClick={() => setIsInventoryFiltersOpen(true)}
            aria-expanded={isInventoryFiltersOpen}
            aria-controls="inventory-filters"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Filters
          </button>
          {hasActiveInventoryFilters ? (
            <button
              type="button"
              className="secondary-button"
              onClick={clearInventoryFilters}
            >
              Clear all
            </button>
          ) : null}
          <button
            ref={inventoryShipmentButtonRef}
            type="button"
            className="primary-button"
            disabled={selectedInventoryItems.length === 0}
            onClick={() => openShipmentModal(selectedInventoryItems)}
          >
            Add Selected To Shipment
            {selectedInventoryItems.length > 0
              ? ` (${formatNumber(selectedInventoryItems.length)})`
              : ""}
          </button>
          <span className="pill">{formatNumber(filteredInventoryRows.length)} entries</span>
        </div>
      </div>

      {showFloatingInventoryAction ? (
        <div className="floating-inventory-actions">
          <button
            type="button"
            className="secondary-button inventory-filter-button"
            onClick={() => setIsInventoryFiltersOpen(true)}
            aria-expanded={isInventoryFiltersOpen}
            aria-controls="inventory-filters"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Filters
          </button>
          {hasActiveInventoryFilters ? (
            <button
              type="button"
              className="secondary-button"
              onClick={clearInventoryFilters}
            >
              Clear all
            </button>
          ) : null}
          <button
            type="button"
            className="primary-button"
            disabled={selectedInventoryItems.length === 0}
            onClick={() => openShipmentModal(selectedInventoryItems)}
          >
            Add Selected To Shipment
            {selectedInventoryItems.length > 0
              ? ` (${formatNumber(selectedInventoryItems.length)})`
              : ""}
          </button>
        </div>
      ) : null}

      <div className="inventory-layout">
        {isInventoryFiltersOpen ? (
          <>
            <div
              className="filter-drawer-backdrop"
              role="presentation"
              onClick={() => setIsInventoryFiltersOpen(false)}
            />
            <aside
              id="inventory-filters"
              className="filters-sidebar filter-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="inventory-filters-title"
            >
          <div className="filters-header">
            <h3 id="inventory-filters-title">Filter Inventory</h3>
            <div className="filters-header-actions">
              <button
                type="button"
                className="clear-filters"
                onClick={clearInventoryFilters}
              >
                Clear all
              </button>
              <button
                type="button"
                className="filter-drawer-close"
                onClick={() => setIsInventoryFiltersOpen(false)}
                aria-label="Close inventory filters"
              >
                ×
              </button>
            </div>
          </div>

          <div className="search-row">
            <label className="search-label" htmlFor="inventory-search">
              Search inventory
            </label>
            <input
              id="inventory-search"
              className="search-input"
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by general supply, exact name, or manufacturer"
            />
          </div>

          <div className="availability-filter-group">
            <div className="availability-toggle filter-availability-toggle">
              <span>Show Available Items</span>
              <button
                type="button"
                className={showAvailableItems ? "toggle-switch on" : "toggle-switch"}
                onClick={() => {
                  setShowAvailableItems((current) => !current);
                  setShowNonAvailableItems(false);
                }}
                aria-label="Show available inventory items only"
                aria-pressed={showAvailableItems}
              >
                <span className="toggle-knob" />
              </button>
            </div>
            <div className="availability-toggle filter-availability-toggle">
              <span>Show Non-Available Items</span>
              <button
                type="button"
                className={showNonAvailableItems ? "toggle-switch on" : "toggle-switch"}
                onClick={() => {
                  setShowNonAvailableItems((current) => !current);
                  setShowAvailableItems(false);
                }}
                aria-label="Show non-available inventory items only"
                aria-pressed={showNonAvailableItems}
              >
                <span className="toggle-knob" />
              </button>
            </div>
          </div>

          <div className="filter-group">
            <h4>Price per Unit</h4>
            <div className="valuation-summary">
              <span>{formatCurrency(valuationRange.min)}</span>
              <span>{formatCurrency(valuationRange.max)}</span>
            </div>
            <div className="valuation-range-slider">
              <div className="valuation-range-track" />
              <div
                className="valuation-range-active"
                style={{
                  left: `${
                    maxUnitPrice === minUnitPrice
                      ? 0
                      : ((valuationRange.min - minUnitPrice) / (maxUnitPrice - minUnitPrice)) *
                        100
                  }%`,
                  right: `${
                    maxUnitPrice === minUnitPrice
                      ? 0
                      : 100 -
                        ((valuationRange.max - minUnitPrice) / (maxUnitPrice - minUnitPrice)) *
                          100
                  }%`,
                }}
              />
              <input
                type="range"
                min={minUnitPrice}
                max={maxUnitPrice}
                step="1"
                value={valuationRange.min}
                onChange={(event) => {
                  const nextMin = Number(event.target.value);
                  setValuationRange((currentRange) => ({
                    min: Math.min(nextMin, currentRange.max),
                    max: currentRange.max,
                  }));
                }}
              />
              <input
                className="valuation-range-input valuation-range-input-max"
                type="range"
                min={minUnitPrice}
                max={maxUnitPrice}
                step="1"
                value={valuationRange.max}
                onChange={(event) => {
                  const nextMax = Number(event.target.value);
                  setValuationRange((currentRange) => ({
                    min: currentRange.min,
                    max: Math.max(nextMax, currentRange.min),
                  }));
                }}
              />
            </div>
          </div>

          <div className="filter-group">
            <h4>Pallet #</h4>
            {palletOptions.map((option) => (
              <label key={option.value} className="filter-option">
                <input
                  type="checkbox"
                  checked={selectedPallets.includes(option.value)}
                  onChange={() =>
                    toggleFilter(setSelectedPallets, selectedPallets, option.value)
                  }
                />
                <span>{option.value}</span>
                <span className="filter-count">{option.count}</span>
              </label>
            ))}
          </div>

          <div className="filter-group">
            <h4>Box Type</h4>
            {boxTypeOptions.map((option) => (
              <label key={option.value} className="filter-option">
                <input
                  type="checkbox"
                  checked={selectedBoxTypes.includes(option.value)}
                  onChange={() =>
                    toggleFilter(setSelectedBoxTypes, selectedBoxTypes, option.value)
                  }
                />
                <span>{option.value}</span>
                <span className="filter-count">{option.count}</span>
              </label>
            ))}
          </div>

          <div className="filter-group">
            <h4>Workflow Status</h4>
            {workflowStatusOptions.map((option) => (
              <label key={option.value} className="filter-option">
                <input
                  type="checkbox"
                  checked={selectedWorkflowStatuses.includes(option.value)}
                  onChange={() =>
                    toggleFilter(
                      setSelectedWorkflowStatuses,
                      selectedWorkflowStatuses,
                      option.value
                    )
                  }
                />
                <span>{option.value}</span>
                <span className="filter-count">{option.count}</span>
              </label>
            ))}
          </div>

          <div className="filter-group">
            <h4>Expiration Date</h4>
            {expirationOptions.map((option) => (
              <label key={option.value} className="filter-option">
                <input
                  type="checkbox"
                  checked={selectedExpiration.includes(option.value)}
                  onChange={() =>
                    toggleFilter(setSelectedExpiration, selectedExpiration, option.value)
                  }
                />
                <span>{option.value}</span>
                <span className="filter-count">{option.count}</span>
              </label>
            ))}
          </div>

          <div className="filter-group">
            <h4>Duration Date</h4>
            {durationOptions.map((option) => (
              <label key={option.value} className="filter-option">
                <input
                  type="checkbox"
                  checked={selectedDuration.includes(option.value)}
                  onChange={() =>
                    toggleFilter(setSelectedDuration, selectedDuration, option.value)
                  }
                />
                <span>{option.value}</span>
                <span className="filter-count">{option.count}</span>
              </label>
            ))}
          </div>

          <div className="filter-group">
            <h4>Supply Categories</h4>
            <div className="category-filter-list">
              {categoryOptions.map((option) => (
                <label key={option.value} className="filter-option">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(option.value)}
                    onChange={() =>
                      toggleFilter(setSelectedCategories, selectedCategories, option.value)
                    }
                  />
                  <span>{option.value}</span>
                  <span className="filter-count">{option.count}</span>
                </label>
              ))}
            </div>
          </div>
            </aside>
          </>
        ) : null}

        <div className="inventory-results">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all filtered inventory items"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      disabled={selectableFilteredInventoryRows.length === 0}
                    />
                  </th>
                  <th><span className="id-column-label">ID</span></th>
                  <th>Status</th>
                  <th>General Supply</th>
                  <th>Exact Supply Name</th>
                  <th>Expiration Date</th>
                  <th>Quantity</th>
                  <th>Per Unit Price</th>
                  <th>Valuation</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventoryRows.map((row) => (
                  <tr
                    key={row.id}
                    className={[
                      row.needsReview ? "inventory-row-review" : "",
                      row.isPartiallyRequested ? "inventory-row-partial" : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined}
                  >
                    <td>
                      {row.inventoryStatus === "Available" ? (
                        <input
                          type="checkbox"
                          aria-label={`Select supply ${row.supplyId}`}
                          checked={selectedInventoryIds.includes(row.id)}
                          onChange={() => toggleInventorySelection(row)}
                        />
                      ) : (
                        <span
                          className="inventory-selection-unavailable"
                          role="img"
                          aria-label={`${row.inventoryStatus} supply cannot be selected`}
                          title={`${row.inventoryStatus} supplies cannot be selected again`}
                        >
                          ×
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="id-cell">
                        <button
                          type="button"
                          className="info-icon-button"
                          onClick={() => openDetailsModal(row)}
                          aria-label={`Open details for supply ${row.supplyId}`}
                        >
                          ⓘ
                        </button>
                      </div>
                    </td>
                    <td>
                      <span
                        className={
                          row.inventoryStatus === "Available"
                            ? "status-pill inventory"
                            : `status-pill ${row.inventoryStatus.toLowerCase()}`
                        }
                      >
                        {row.inventoryStatus}
                      </span>
                    </td>
                    <td>{row.generalSupply}</td>
                    <td>{row.exactSupplyName}</td>
                    <td>
                      <div className="expiration-cell">
                        <span>{row.expirationDate}</span>
                        <span className={`expiration-pill ${row.expirationStatus.tone}`}>
                          {row.expirationStatus.label}
                        </span>
                      </div>
                    </td>
                    <td>{formatNumber(row.quantity)}</td>
                    <td>{formatCurrency(row.unitPrice)}</td>
                    <td>{formatCurrency(row.valuation)}</td>
                  </tr>
                ))}
                {filteredInventoryRows.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty-state-cell">
                      No inventory items matched the current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

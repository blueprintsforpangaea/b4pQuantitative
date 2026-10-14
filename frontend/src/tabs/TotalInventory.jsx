import { Fragment, useState } from "react";
import { durationBucketOrder, expiryTiers, supplyStatusOrder } from "../lib/colors.js";
import { formatCurrency, formatNumber } from "../lib/format.js";
import { buildFacetCounts, groupByProduct } from "../lib/inventory.js";
import { availableQty } from "../lib/shipments.js";

const tierById = Object.fromEntries(expiryTiers.map((tier) => [tier.id, tier]));
const GROUP_OPTIONS = [
  { id: "none", label: "None" },
  { id: "category", label: "Category" },
  { id: "expiry", label: "Expiry date" },
];

function ExpiryTag({ row }) {
  const tier = tierById[row.expiryTier];
  return (
    <span className="tag" style={{ background: tier.color, color: tier.text }}>
      {row.expiryTier === "none" ? tier.label : row.expirationStatus.label}
    </span>
  );
}

// /allocations omits shipment_name for callers without the admin token; then the line is just the count.
function shipmentNames(allocation) {
  return [...new Set(allocation.shipments.map((entry) => entry.shipment_name).filter(Boolean))].join(", ");
}

function StatusTag({ status }) {
  return <span className={`tag tag-status tag-${status.toLowerCase()}`}>{status}</span>;
}

function PulledTag({ units }) {
  return units > 0 ? <span className="tag tag-status tag-partial">{formatNumber(units)} pulled</span> : null;
}

export default function TotalInventory({
  allocationsByItem,
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
  selectedExpiryTiers,
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
  setSelectedExpiryTiers,
  setSelectedInventoryIds,
  setSelectedPallets,
  setSelectedShipmentId,
  setSelectedWorkflowStatuses,
  setValuationRange,
  showFloatingInventoryAction,
  valuationRange,
}) {
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const [groupBy, setGroupBy] = useState("category");
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

  function buildSections(rows, mode) {
    if (mode === "category") {
      return buildFacetCounts(rows, "category")
        .filter((entry) => entry.count > 0)
        .map((entry) => ({ id: entry.value, label: entry.value, rows: rows.filter((row) => row.category === entry.value) }));
    }
    if (mode === "expiry") {
      return expiryTiers
        .map((tier) => ({ id: tier.id, label: tier.label, color: tier.color, rows: rows.filter((row) => row.expiryTier === tier.id) }))
        .filter((section) => section.rows.length > 0);
    }
    return [{ id: "all", label: "", rows }];
  }

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

  // skip lets the category chips and expiry legend count "what would I get if I picked this".
  function rowPasses(row, skip = "") {
    const matchesSearch =
      !normalizedSearch ||
      [row.generalSupply, row.exactSupplyName, row.manufacturer, row.category].some((value) =>
        value.toLowerCase().includes(normalizedSearch)
      );

    return (
      matchesSearch &&
      row.unitPrice >= valuationRange.min &&
      row.unitPrice <= valuationRange.max &&
      matchesSelectedFilter(selectedPallets, row.palletNumber) &&
      matchesSelectedFilter(selectedBoxTypes, row.boxType) &&
      matchesSelectedFilter(selectedExpiration, row.expirationFilter) &&
      matchesSelectedFilter(selectedDuration, row.durationFilter) &&
      (skip === "tier" || matchesSelectedFilter(selectedExpiryTiers, row.expiryTier)) &&
      (skip === "category" || matchesSelectedFilter(selectedCategories, row.category)) &&
      matchesSelectedFilter(selectedWorkflowStatuses, row.supplyWorkflowStatus)
    );
  }

  const filteredInventoryRows = inventoryRowsWithShipmentStatus.filter((row) => rowPasses(row));

  const categoryChips = buildFacetCounts(
    inventoryRowsWithShipmentStatus.filter((row) => rowPasses(row, "category")),
    "category"
  );
  const tierCounts = inventoryRowsWithShipmentStatus
    .filter((row) => rowPasses(row, "tier"))
    .reduce((counts, row) => ({ ...counts, [row.expiryTier]: (counts[row.expiryTier] || 0) + 1 }), {});

  const sections = buildSections(filteredInventoryRows, groupBy);

  function toggleExpanded(key) {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleGroupSelection(group) {
    const ids = group.rows.filter((row) => row.inventoryStatus === "Available").map((row) => row.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedInventoryIds.includes(id));
    setSelectedInventoryIds((currentIds) =>
      allSelected
        ? currentIds.filter((id) => !ids.includes(id))
        : [...new Set([...currentIds, ...ids])]
    );
  }

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
    selectedExpiryTiers.length > 0 ||
    valuationRange.min !== minUnitPrice ||
    valuationRange.max !== maxUnitPrice;

  const allFilteredSelected =
    selectableFilteredInventoryRows.length > 0 &&
    selectableFilteredInventoryRows.every((row) => selectedInventoryIds.includes(row.id));

  const filterButton = (
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
  );
  const addToShipmentLabel = `Add Selected To Shipment${
    selectedInventoryItems.length > 0 ? ` (${formatNumber(selectedInventoryItems.length)})` : ""
  }`;

  // Partial pulls: part of a lot sits in an active shipment, the rest is still free.
  function renderLotRow(row, nested) {
    const allocation = allocationsByItem?.get(String(row.id));
    const pulled = Math.min(allocation?.pulled || 0, row.quantity || 0);
    const available = availableQty(row.quantity, allocationsByItem || new Map(), row.id);
    return (
      <Fragment key={row.id}>
        {renderLotLine(row, nested, pulled > 0, pulled >= (row.quantity || 0) ? "Pulled" : row.inventoryStatus, pulled < (row.quantity || 0) ? pulled : 0)}
        {pulled > 0 ? (
          <tr className="alloc-row">
            <td />
            <td colSpan="6">
              <div className="alloc-line alloc-pulled">
                <strong>Pulled</strong> — {formatNumber(pulled)} units
                {shipmentNames(allocation) ? ` → ${shipmentNames(allocation)}` : ""}
              </div>
              <div className="alloc-line">
                <strong>Available</strong> — {formatNumber(available)} units
              </div>
            </td>
          </tr>
        ) : null}
      </Fragment>
    );
  }

  function renderLotLine(row, nested, hasPull, displayStatus, partialPulled) {
    return (
      <tr
        className={[
          nested ? "lot-row" : "",
          hasPull ? "has-alloc" : "",
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
          <div className="product-cell">
            <button
              type="button"
              className="info-icon-button"
              onClick={() => openDetailsModal(row)}
              aria-label={`Open details for supply ${row.supplyId}`}
            >
              ⓘ
            </button>
            <div>
              <div className="product-name">{row.exactSupplyName}</div>
              <div className="product-meta">
                {row.locationInfo}
                {row.manufacturer !== "Unknown" ? ` · ${row.manufacturer}` : ""}
              </div>
              <div className="status-inline">
                <StatusTag status={displayStatus} />
                <PulledTag units={partialPulled} />
                <ExpiryTag row={row} />
              </div>
            </div>
          </div>
        </td>
        <td>
          <span className="tag-stack">
            <StatusTag status={displayStatus} />
            <PulledTag units={partialPulled} />
          </span>
        </td>
        <td>
          <div className="expiration-cell">
            <span>{row.expirationDate}</span>
            <ExpiryTag row={row} />
          </div>
        </td>
        <td className="num">{formatNumber(row.quantity)}</td>
        <td className="num">{formatCurrency(row.unitPrice)}</td>
        <td className="num">{formatCurrency(row.valuation)}</td>
      </tr>
    );
  }

  function renderGroup(group, sectionId) {
    if (group.rows.length === 1) {
      return renderLotRow(group.rows[0], false);
    }

    const key = `${sectionId}::${group.key}`;
    const isOpen = expandedKeys.has(key);
    const selectableIds = group.rows.filter((row) => row.inventoryStatus === "Available").map((row) => row.id);
    const selectedCount = selectableIds.filter((id) => selectedInventoryIds.includes(id)).length;
    const statuses = [...new Set(group.rows.map((row) => row.inventoryStatus))];
    const pulledUnits = group.rows.reduce(
      (total, row) =>
        total + Math.min(allocationsByItem?.get(String(row.id))?.pulled || 0, row.quantity || 0),
      0
    );
    const prices = group.rows.map((row) => row.unitPrice);
    const lowPrice = Math.min(...prices);
    const highPrice = Math.max(...prices);
    const soonest = group.rows.find((row) => row.expirationDaysLeft === group.soonestDaysLeft) || group.rows[0];

    return (
      <>
        <tr key={key} className="group-row">
          <td>
            <input
              type="checkbox"
              aria-label={`Select all available lots of ${group.name}`}
              checked={selectableIds.length > 0 && selectedCount === selectableIds.length}
              ref={(node) => {
                if (node) {
                  node.indeterminate = selectedCount > 0 && selectedCount < selectableIds.length;
                }
              }}
              disabled={selectableIds.length === 0}
              onChange={() => toggleGroupSelection(group)}
            />
          </td>
          <td>
            <button
              type="button"
              className="group-toggle"
              onClick={() => toggleExpanded(key)}
              aria-expanded={isOpen}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className={isOpen ? "chevron open" : "chevron"}>
                <path d="M9 6l6 6-6 6" />
              </svg>
              <span>
                <span className="product-name">{group.name}</span>
                <span className="product-meta">
                  {group.rows.length} lots/variants · {group.category}
                </span>
                <span className="status-inline tag-stack">
                  {statuses.map((status) => (
                    <StatusTag key={status} status={status} />
                  ))}
                  <PulledTag units={pulledUnits} />
                  <ExpiryTag row={soonest} />
                </span>
              </span>
            </button>
          </td>
          <td>
            <span className="tag-stack">
              {statuses.map((status) => (
                <StatusTag key={status} status={status} />
              ))}
              <PulledTag units={pulledUnits} />
            </span>
          </td>
          <td>
            <div className="expiration-cell">
              <span>Soonest {soonest.expirationDate}</span>
              <ExpiryTag row={soonest} />
            </div>
          </td>
          <td className="num">{formatNumber(group.totalQuantity)}</td>
          <td className="num">
            {lowPrice === highPrice
              ? formatCurrency(lowPrice)
              : `${formatCurrency(lowPrice)}\u2013${formatCurrency(highPrice)}`}
          </td>
          <td className="num">{formatCurrency(group.totalValue)}</td>
        </tr>
        {isOpen ? group.rows.map((row) => renderLotRow(row, true)) : null}
      </>
    );
  }

  const productCount = sections.reduce((total, section) => total + groupByProduct(section.rows).length, 0);

  return (
    <section className="panel">
      <div className="inventory-toolbar">
        <div className="inventory-search">
          <label className="search-label" htmlFor="inventory-search">
            Search inventory
          </label>
          <input
            id="inventory-search"
            className="search-input"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by supply, category, or manufacturer"
          />
        </div>
        <div className="inventory-actions">
          {filterButton}
          {hasActiveInventoryFilters ? (
            <button type="button" className="secondary-button" onClick={clearInventoryFilters}>
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
            {addToShipmentLabel}
          </button>
        </div>
      </div>

      <div className="category-chips" role="group" aria-label="Filter by category">
        <button
          type="button"
          className={selectedCategories.length === 0 ? "chip active" : "chip"}
          aria-pressed={selectedCategories.length === 0}
          onClick={() => setSelectedCategories([])}
        >
          All
          <span className="chip-count">
            {formatNumber(categoryChips.reduce((total, chip) => total + chip.count, 0))}
          </span>
        </button>
        {categoryChips.map((chip) => {
          const active = selectedCategories.includes(chip.value);
          return (
            <button
              key={chip.value}
              type="button"
              className={active ? "chip active" : "chip"}
              aria-pressed={active}
              onClick={() => toggleFilter(setSelectedCategories, selectedCategories, chip.value)}
            >
              {chip.value}
              <span className="chip-count">{formatNumber(chip.count)}</span>
            </button>
          );
        })}
      </div>

      <div className="inventory-subbar">
        <div className="expiry-legend" role="group" aria-label="Filter by expiry">
          {expiryTiers.map((tier) => {
            const active = selectedExpiryTiers.includes(tier.id);
            return (
              <button
                key={tier.id}
                type="button"
                className={active ? "legend-item active" : "legend-item"}
                aria-pressed={active}
                onClick={() => toggleFilter(setSelectedExpiryTiers, selectedExpiryTiers, tier.id)}
              >
                <span className="legend-swatch" style={{ background: tier.color }} aria-hidden="true" />
                {tier.label}
                <span className="chip-count">{formatNumber(tierCounts[tier.id] || 0)}</span>
              </button>
            );
          })}
        </div>
        <div className="group-by" role="group" aria-label="Group by">
          <span className="group-by-label">Group by</span>
          {GROUP_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={groupBy === option.id ? "segment active" : "segment"}
              aria-pressed={groupBy === option.id}
              onClick={() => setGroupBy(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="entry-count">
          {formatNumber(productCount)} {productCount === 1 ? "product" : "products"} · {formatNumber(filteredInventoryRows.length)} {filteredInventoryRows.length === 1 ? "line" : "lines"}
        </span>
      </div>

      {showFloatingInventoryAction ? (
        <div className="floating-inventory-actions">
          {filterButton}
          {hasActiveInventoryFilters ? (
            <button type="button" className="secondary-button" onClick={clearInventoryFilters}>
              Clear all
            </button>
          ) : null}
          <button
            type="button"
            className="primary-button"
            disabled={selectedInventoryItems.length === 0}
            onClick={() => openShipmentModal(selectedInventoryItems)}
          >
            {addToShipmentLabel}
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
                  <button type="button" className="clear-filters" onClick={clearInventoryFilters}>
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
                          : ((valuationRange.min - minUnitPrice) / (maxUnitPrice - minUnitPrice)) * 100
                      }%`,
                      right: `${
                        maxUnitPrice === minUnitPrice
                          ? 0
                          : 100 - ((valuationRange.max - minUnitPrice) / (maxUnitPrice - minUnitPrice)) * 100
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

              <details className="more-filters">
                <summary>More filters</summary>
                {[
                  ["Pallet #", palletOptions, selectedPallets, setSelectedPallets],
                  ["Box Type", boxTypeOptions, selectedBoxTypes, setSelectedBoxTypes],
                  ["Workflow Status", workflowStatusOptions, selectedWorkflowStatuses, setSelectedWorkflowStatuses],
                  ["Expiration Date", expirationOptions, selectedExpiration, setSelectedExpiration],
                  ["Time in warehouse", durationOptions, selectedDuration, setSelectedDuration],
                ].map(([title, options, selected, setter]) => (
                  <div className="filter-group" key={title}>
                    <h4>{title}</h4>
                    {options.map((option) => (
                      <label key={option.value} className="filter-option">
                        <input
                          type="checkbox"
                          checked={selected.includes(option.value)}
                          onChange={() => toggleFilter(setter, selected, option.value)}
                        />
                        <span>{option.value}</span>
                        <span className="filter-count">{option.count}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </details>
            </aside>
          </>
        ) : null}

        <div className="inventory-results">
          <div className="table-wrap">
            <table className="inventory-table">
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
                  <th>Supply</th>
                  <th>Status</th>
                  <th>Expiration</th>
                  <th className="num">Quantity</th>
                  <th className="num">Unit price</th>
                  <th className="num">Valuation</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => {
                  const groups = groupByProduct(section.rows);
                  return (
                    <Fragment key={section.id}>
                      {groupBy !== "none" ? (
                        <tr className="section-row">
                          <td colSpan="7">
                            {section.color ? (
                              <span className="legend-swatch" style={{ background: section.color }} aria-hidden="true" />
                            ) : null}
                            <strong>{section.label}</strong>
                            <span className="section-count">
                              {formatNumber(groups.length)} {groups.length === 1 ? "product" : "products"} ·{" "}
                              {formatNumber(section.rows.reduce((total, row) => total + (row.quantity || 0), 0))} units
                            </span>
                          </td>
                        </tr>
                      ) : null}
                      {groups.map((group) => (
                        <Fragment key={group.key}>{renderGroup(group, section.id)}</Fragment>
                      ))}
                    </Fragment>
                  );
                })}
                {filteredInventoryRows.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-state-cell">
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

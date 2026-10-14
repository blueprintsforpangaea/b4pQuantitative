import { useEffect, useMemo, useRef, useState } from "react";

import StockAlerts from "./StockAlerts.jsx";
import Requests from "./Requests.jsx";
import SyncCell from "./SyncCell.jsx";
import { API_BASE, tabs } from "./lib/config.js";
import { useAllocations } from "./lib/shipments.js";
import { averageShipmentDays, parseLocalDate, todayIsoDate } from "./lib/dates.js";
import { formatNumber } from "./lib/format.js";
import { buildInventoryRows, inventoryStatusForItem } from "./lib/inventory.js";
import { normalizeRequestedQuantity, normalizeShipmentType, requestedShipmentItemValue } from "./lib/shipments.js";
import { useShipments } from "./lib/useShipments.js";
import { toLegacyShipments } from "./lib/shipmentsLogic.js";
import { AddItemsModal } from "./components/ShipmentForms.jsx";
import { applyDashboardTooltips } from "./lib/tooltips.js";
import TotalInventory from "./tabs/TotalInventory.jsx";
import InventoryKpis from "./tabs/InventoryKpis.jsx";
import Shipments from "./tabs/Shipments.jsx";
import ShipmentKpis from "./tabs/ShipmentKpis.jsx";
import ShipmentModals from "./components/ShipmentModals.jsx";
import { InventoryDetailsModal } from "./components/InventoryModals.jsx";
import ShipmentKpiModals from "./components/ShipmentKpiModals.jsx";

export default function App() {
  const { allocations, byItem: allocationsByItem } = useAllocations();
  const [activeTab, setActiveTab] = useState("inventory");
  const [activeShipmentSubtab, setActiveShipmentSubtab] = useState("current");
  const [activeShipmentKpiSubtab, setActiveShipmentKpiSubtab] = useState("overview");
  const [items, setItems] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedExpiration, setSelectedExpiration] = useState([]);
  const [selectedDuration, setSelectedDuration] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedExpiryTiers, setSelectedExpiryTiers] = useState([]);
  const [selectedPallets, setSelectedPallets] = useState([]);
  const [selectedBoxTypes, setSelectedBoxTypes] = useState([]);
  const [selectedWorkflowStatuses, setSelectedWorkflowStatuses] = useState([]);
  const [showAvailableItems, setShowAvailableItems] = useState(false);
  const [showNonAvailableItems, setShowNonAvailableItems] = useState(false);
  const [isInventoryFiltersOpen, setIsInventoryFiltersOpen] = useState(false);
  const [showFloatingInventoryAction, setShowFloatingInventoryAction] = useState(false);
  const [shipmentFocus, setShipmentFocus] = useState(null);
  const shipmentsState = useShipments({ items });
  const { shipments, nonInventoryShipments } = useMemo(
    () => toLegacyShipments(shipmentsState.shipments),
    [shipmentsState.shipments]
  );
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
  const [pendingShipmentItems, setPendingShipmentItems] = useState([]);
  const [selectedInventoryIds, setSelectedInventoryIds] = useState([]);
  const [valuationRange, setValuationRange] = useState({ min: 0, max: 0 });
  const [isShipmentValueDataOpen, setIsShipmentValueDataOpen] = useState(false);
  const [isShipmentItemsDataOpen, setIsShipmentItemsDataOpen] = useState(false);
  const [shipmentValueKpiYear, setShipmentValueKpiYear] = useState(() => new Date().getFullYear());
  const [shipmentItemsKpiYear, setShipmentItemsKpiYear] = useState(() => new Date().getFullYear());
  const [detailsItem, setDetailsItem] = useState(null);
  const [shipmentDate, setShipmentDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [isAllShipmentKpisOpen, setIsAllShipmentKpisOpen] = useState(false);
  const [isAllShipmentFlowMetricsOpen, setIsAllShipmentFlowMetricsOpen] = useState(false);
  const inventoryShipmentButtonRef = useRef(null);
  async function refreshDashboard(showLoader = false) {
    try {
      if (showLoader) {
        setLoading(true);
      }
      setError("");

      const [itemsResponse, kpisResponse] = await Promise.all([
        fetch(`${API_BASE}/items`),
        fetch(`${API_BASE}/kpis`),
      ]);

      if (!itemsResponse.ok || !kpisResponse.ok) {
        const failed = itemsResponse.ok ? kpisResponse : itemsResponse;
        throw new Error(
          failed.status === 503
            ? "The inventory database is unavailable right now. Please retry in a minute."
            : "The dashboard could not load data from the backend.",
        );
      }

      const [itemsData, kpisData] = await Promise.all([
        itemsResponse.json(),
        kpisResponse.json(),
      ]);

      setItems(itemsData);
      setKpis(kpisData);
      setLastRefreshedAt(new Date());
    } catch (err) {
      setError(err.message || "Something went wrong while loading the dashboard.");
      throw err;
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }
  useEffect(() => {
    applyDashboardTooltips();
    const observer = new MutationObserver(() => applyDashboardTooltips());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;

    refreshDashboard(true).catch(() => {
      if (cancelled) {
        return;
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const button = inventoryShipmentButtonRef.current;
    if (activeTab !== "inventory" || loading || error || !button) {
      setShowFloatingInventoryAction(false);
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      const hasScrolledPastButton =
        !entry.isIntersecting && entry.boundingClientRect.bottom <= 16;
      setShowFloatingInventoryAction(hasScrolledPastButton);
    });

    observer.observe(button);
    return () => observer.disconnect();
  }, [activeTab, loading, error]);
  const currentShipments = shipments.filter((shipment) => !shipment.isCompleted);
  const pastShipments = shipments.filter((shipment) => shipment.isCompleted);
  const currentShipmentRequestTotals = shipments
    .filter((shipment) => !shipment.isCompleted)
    .reduce((accumulator, shipment) => {
      shipment.items.forEach((item) => {
        const itemId = String(item.id);
        accumulator[itemId] = (accumulator[itemId] || 0) + normalizeRequestedQuantity(item);
      });
      return accumulator;
    }, {});
  const completedShipmentItemIds = new Set(
    shipments
      .filter((shipment) => shipment.isCompleted)
      .flatMap((shipment) => shipment.items.map((item) => String(item.id)))
  );
  const inventoryRows = buildInventoryRows(items).filter(
    (row) => !completedShipmentItemIds.has(String(row.id))
  );
  const inventoryRowsWithStatus = inventoryRows.map((row) => ({
    ...row,
    inventoryStatus: inventoryStatusForItem(row.id, shipments),
    requestedQuantity: currentShipmentRequestTotals[String(row.id)] || 0,
    isPartiallyRequested:
      (currentShipmentRequestTotals[String(row.id)] || 0) > 0 &&
      (currentShipmentRequestTotals[String(row.id)] || 0) < (row.quantity || 0),
  }));
  const inventoryRowsWithShipmentStatus = inventoryRowsWithStatus.map((row) => {
    const matchingShipmentItems = currentShipments.flatMap((shipment) =>
      shipment.items.filter((shipmentItem) => String(shipmentItem.id) === String(row.id))
    );
    const supplyWorkflowStatus =
      matchingShipmentItems.length === 0
        ? "Inventory"
        : matchingShipmentItems.some((shipmentItem) => shipmentItem.isConsolidated)
          ? "Consolidated"
          : "Pulled";

    return {
      ...row,
      inventoryStatus:
        supplyWorkflowStatus === "Inventory" ? "Available" : supplyWorkflowStatus,
      supplyWorkflowStatus,
    };
  });
  const allBoxTypes = [...new Set(inventoryRowsWithStatus.map((row) => row.boxType).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right)
  );
  const unitPriceValues = inventoryRowsWithStatus.map((row) => row.unitPrice);
  const minUnitPrice = unitPriceValues.length > 0 ? Math.min(...unitPriceValues) : 0;
  const maxUnitPrice = unitPriceValues.length > 0 ? Math.max(...unitPriceValues) : 0;
  useEffect(() => {
    setValuationRange({ min: minUnitPrice, max: maxUnitPrice });
  }, [minUnitPrice, maxUnitPrice]);
  function jumpToPastShipment(shipmentId, shipmentName) {
    setActiveTab("shipments");
    setShipmentFocus({ id: shipmentId, name: shipmentName || "", nonce: Date.now() });
  }
  function clearInventoryFilters() {
    setSelectedExpiration([]);
    setSelectedDuration([]);
    setSelectedCategories([]);
    setSelectedExpiryTiers([]);
    setSelectedPallets([]);
    setSelectedBoxTypes([]);
    setSelectedWorkflowStatuses([]);
    setShowAvailableItems(false);
    setShowNonAvailableItems(false);
    setValuationRange({ min: minUnitPrice, max: maxUnitPrice });
    setSearchTerm("");
  }
  function parseSupplyIdsInput(value) {
    return [...new Set(
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    )];
  }
  function itemsFromSupplyIds(value) {
    const selectedIds = parseSupplyIdsInput(value);
    return inventoryRowsWithStatus.filter(
      (row) =>
        row.inventoryStatus === "Available" &&
        selectedIds.includes(String(row.supplyId))
    );
  }
  function openDetailsModal(item) {
    setDetailsItem(item);
  }
  const localShipments = shipments.filter(
    (shipment) => normalizeShipmentType(shipment.shipmentType) === "Local"
  );
  const internationalShipments = shipments.filter(
    (shipment) => normalizeShipmentType(shipment.shipmentType) === "International"
  );
  const shipmentTimingMetrics = [
    {
      scope: "Local",
      label: "Avg Days From Creation to Shipment",
      value: averageShipmentDays(localShipments, "createdAt", "shippedAt"),
    },
    {
      scope: "Local",
      label: "Avg Time to Start Consolidation",
      value: averageShipmentDays(localShipments, "createdAt", "consolidationStartedAt"),
    },
    {
      scope: "Local",
      label: "Avg Consolidation Time",
      value: averageShipmentDays(localShipments, "consolidationStartedAt", "consolidationCompletedAt"),
    },
    {
      scope: "Local",
      label: "Avg Waiting Time to Ship",
      value: averageShipmentDays(localShipments, "consolidationCompletedAt", "shippedAt"),
    },
    {
      scope: "Local",
      label: "Avg Delivery Time",
      value: averageShipmentDays(localShipments, "shippedAt", "deliveryDate"),
    },
    {
      scope: "International",
      label: "Avg Days From Creation to Shipment",
      value: averageShipmentDays(internationalShipments, "createdAt", "shippedAt"),
    },
    {
      scope: "International",
      label: "Avg Time to Start Consolidation",
      value: averageShipmentDays(internationalShipments, "createdAt", "consolidationStartedAt"),
    },
    {
      scope: "International",
      label: "Avg Consolidation Time",
      value: averageShipmentDays(internationalShipments, "consolidationStartedAt", "consolidationCompletedAt"),
    },
    {
      scope: "International",
      label: "Avg Waiting Time to Ship",
      value: averageShipmentDays(internationalShipments, "consolidationCompletedAt", "shippedAt"),
    },
    {
      scope: "International",
      label: "Avg Delivery Time",
      value: averageShipmentDays(internationalShipments, "shippedAt", "deliveryDate"),
    },
  ];
  const shipmentValueEntries = [
    ...pastShipments.map((shipment) => ({
      shipment,
      shipmentKind: "inventory",
      shipmentDate: shipment.shippedAt,
      shipmentValue: shipment.items.reduce(
        (total, item) => total + requestedShipmentItemValue(item),
        0
      ),
      shipmentItems: shipment.items.reduce(
        (total, item) => total + normalizeRequestedQuantity(item),
        0
      ),
    })),
    ...nonInventoryShipments.map((shipment) => ({
      shipment,
      shipmentKind: "non-inventory",
      shipmentDate: shipment.shippedAt || shipment.createdAt,
      shipmentValue: Number(shipment.valuation) || 0,
      shipmentItems: 0,
    })),
  ];
  function buildShipmentYearPoints(year) {
    const windowStart = new Date(year, 0, 1);
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(year, 11, 31);
    windowEnd.setHours(0, 0, 0, 0);
    const totalDays = Math.max(1, Math.round((windowEnd - windowStart) / 86400000));

    return shipmentValueEntries
      .map((entry) => ({ ...entry, shippedDate: parseLocalDate(entry.shipmentDate) }))
      .filter(({ shippedDate }) => shippedDate && shippedDate >= windowStart && shippedDate <= windowEnd)
      .sort((left, right) => left.shippedDate - right.shippedDate)
      .reduce((accumulator, entry) => {
        const previousTotal =
          accumulator.length > 0 ? accumulator[accumulator.length - 1].cumulativeValue : 0;
        accumulator.push({
          shipmentId: entry.shipment.id,
          shipmentKind: entry.shipmentKind,
          label: entry.shipment.recipientName || entry.shipment.clinicName || "Shipment",
          shipmentDateLabel: entry.shipment.shippedAt || entry.shipment.createdAt,
          shipmentValue: entry.shipmentValue,
          shipmentItems: entry.shipmentItems,
          cumulativeValue: previousTotal + entry.shipmentValue,
          dayOffset: Math.max(0, Math.round((entry.shippedDate - windowStart) / 86400000)),
          totalDays,
        });
        return accumulator;
      }, []);
  }
  const shipmentValueByYearPoints = buildShipmentYearPoints(shipmentValueKpiYear);
  const shipmentItemsByYearPoints = buildShipmentYearPoints(shipmentItemsKpiYear)
    .filter((point) => point.shipmentKind === "inventory")
    .reduce((accumulator, point) => {
    const previousTotal = accumulator.length > 0 ? accumulator[accumulator.length - 1].cumulativeItems : 0;
    accumulator.push({
      ...point,
      cumulativeItems: previousTotal + point.shipmentItems,
    });
    return accumulator;
    }, []);
  // Each tab is a sheet in the set; the title block names the one you're on.
  const sheetCodes = {
    inventory: "INV-01",
    kpis: "INV-02",
    shipments: "SHP-03",
    "shipment-kpis": "SHP-04",
  };
  const activeSheetCode = sheetCodes[activeTab] || "INV-01";
  const lastRefreshedLabel = lastRefreshedAt
    ? lastRefreshedAt.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  const totalUnitsOnHand = inventoryRowsWithStatus.reduce(
    (total, row) => total + (row.quantity || 0),
    0
  );

  return (
    <main className="page-shell">
      {/* A drawing sheet names itself in a ruled title block. This one carries
          the live counts, so the header does a job instead of just branding. */}

      <header className="top-bar">
        <div className="title-block">
          <div className="title-block-cell">
            <h1>
              <em>Blueprints for Pangaea</em>
              Operations Dashboard
            </h1>
          </div>
          <div className="title-block-cell">
            <p className="title-block-label">Sheet</p>
            <p className="title-block-value">{activeSheetCode}</p>
          </div>
          <div className="title-block-cell">
            <p className="title-block-label">Entries</p>
            <p className="title-block-value">
              {loading || error ? "—" : formatNumber(inventoryRowsWithStatus.length)}
            </p>
          </div>
          <div className="title-block-cell">
            <p className="title-block-label">Units on hand</p>
            <p className="title-block-value">
              {loading || error ? "—" : formatNumber(totalUnitsOnHand)}
            </p>
          </div>
          <SyncCell fallbackLabel={lastRefreshedLabel} />
        </div>
        <div className="title-block-logo">
          <img
            className="dashboard-logo"
            src="/blueprints-logo.png"
            alt="Blueprints for Pangaea"
          />
        </div>

      </header>

      <section className="tabs-section">
        <div className="tabs" role="tablist" aria-label="Dashboard sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.id === activeTab ? "tab-button active" : "tab-button"}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

      </section>

      {loading ? <div className="panel">Loading dashboard data...</div> : null}

      {error ? <div className="panel error-panel">{error}</div> : null}

      {!loading && !error && activeTab === "inventory" ? (
<TotalInventory
          allocationsByItem={allocationsByItem}
          clearInventoryFilters={clearInventoryFilters}
          inventoryRowsWithShipmentStatus={inventoryRowsWithShipmentStatus}
          inventoryRowsWithStatus={inventoryRowsWithStatus}
          inventoryShipmentButtonRef={inventoryShipmentButtonRef}
          isInventoryFiltersOpen={isInventoryFiltersOpen}
          items={items}
          maxUnitPrice={maxUnitPrice}
          minUnitPrice={minUnitPrice}
          openDetailsModal={openDetailsModal}
          searchTerm={searchTerm}
          selectedBoxTypes={selectedBoxTypes}
          selectedCategories={selectedCategories}
          selectedDuration={selectedDuration}
          selectedExpiration={selectedExpiration}
          selectedExpiryTiers={selectedExpiryTiers}
          selectedInventoryIds={selectedInventoryIds}
          selectedPallets={selectedPallets}
          selectedWorkflowStatuses={selectedWorkflowStatuses}
          setIsInventoryFiltersOpen={setIsInventoryFiltersOpen}
          setIsShipmentModalOpen={setIsShipmentModalOpen}
          setPendingShipmentItems={setPendingShipmentItems}
          setSearchTerm={setSearchTerm}
          setSelectedBoxTypes={setSelectedBoxTypes}
          setSelectedCategories={setSelectedCategories}
          setSelectedDuration={setSelectedDuration}
          setSelectedExpiration={setSelectedExpiration}
          setSelectedExpiryTiers={setSelectedExpiryTiers}
          setSelectedInventoryIds={setSelectedInventoryIds}
          setSelectedPallets={setSelectedPallets}
          setSelectedWorkflowStatuses={setSelectedWorkflowStatuses}
          setValuationRange={setValuationRange}
          showFloatingInventoryAction={showFloatingInventoryAction}
          valuationRange={valuationRange}
        />
      ) : null}

      {!loading && !error && activeTab === "stock-alerts" ? <StockAlerts /> : null}

      {!loading && !error && activeTab === "requests" ? <Requests /> : null}

      {!loading && !error && activeTab === "kpis" ? (
<InventoryKpis
          allocations={allocations}
          allocationsByItem={allocationsByItem}
          clearInventoryFilters={clearInventoryFilters}
          inventoryRowsWithShipmentStatus={inventoryRowsWithShipmentStatus}
          kpis={kpis}
          setActiveTab={setActiveTab}
          setIsInventoryFiltersOpen={setIsInventoryFiltersOpen}
          setSelectedCategories={setSelectedCategories}
          setSelectedDuration={setSelectedDuration}
          setSelectedExpiryTiers={setSelectedExpiryTiers}
          setSelectedInventoryIds={setSelectedInventoryIds}
          setSelectedPallets={setSelectedPallets}
          setSelectedWorkflowStatuses={setSelectedWorkflowStatuses}
        />
      ) : null}

      {!loading && !error && activeTab === "shipments" ? (
<Shipments items={items} state={shipmentsState} focus={shipmentFocus} />
      ) : null}

      {!loading && !error && activeTab === "shipment-kpis" ? (
<ShipmentKpis
          activeShipmentKpiSubtab={activeShipmentKpiSubtab}
          currentShipments={currentShipments}
          items={items}
          jumpToPastShipment={jumpToPastShipment}
          setActiveShipmentKpiSubtab={setActiveShipmentKpiSubtab}
          setActiveShipmentSubtab={setActiveShipmentSubtab}
          setActiveTab={setActiveTab}
          setIsAllShipmentFlowMetricsOpen={setIsAllShipmentFlowMetricsOpen}
          setIsAllShipmentKpisOpen={setIsAllShipmentKpisOpen}
          setIsShipmentItemsDataOpen={setIsShipmentItemsDataOpen}
          setIsShipmentValueDataOpen={setIsShipmentValueDataOpen}
          setShipmentItemsKpiYear={setShipmentItemsKpiYear}
          setShipmentValueKpiYear={setShipmentValueKpiYear}
          shipmentItemsByYearPoints={shipmentItemsByYearPoints}
          shipmentItemsKpiYear={shipmentItemsKpiYear}
          shipmentTimingMetrics={shipmentTimingMetrics}
          shipmentValueByYearPoints={shipmentValueByYearPoints}
          shipmentValueEntries={shipmentValueEntries}
          shipmentValueKpiYear={shipmentValueKpiYear}
          shipments={shipments}
        />
      ) : null}

<ShipmentModals
          isShipmentItemsDataOpen={isShipmentItemsDataOpen}
          isShipmentValueDataOpen={isShipmentValueDataOpen}
          jumpToPastShipment={jumpToPastShipment}
          setActiveShipmentSubtab={setActiveShipmentSubtab}
          setActiveTab={setActiveTab}
          setIsShipmentItemsDataOpen={setIsShipmentItemsDataOpen}
          setIsShipmentValueDataOpen={setIsShipmentValueDataOpen}
          shipmentItemsByYearPoints={shipmentItemsByYearPoints}
          shipmentItemsKpiYear={shipmentItemsKpiYear}
          shipmentValueByYearPoints={shipmentValueByYearPoints}
          shipmentValueKpiYear={shipmentValueKpiYear}
        />

      {isShipmentModalOpen && pendingShipmentItems.length > 0 ? (
        <AddItemsModal
          items={items}
          shipments={shipmentsState.shipments}
          preselected={pendingShipmentItems
            .map((row) => items.find((item) => String(item.id) === String(row.id)))
            .filter(Boolean)}
          onClose={() => {
            setIsShipmentModalOpen(false);
            setPendingShipmentItems([]);
            setSelectedInventoryIds([]);
          }}
          onSetLines={shipmentsState.setLines}
          onCreate={shipmentsState.create}
        />
      ) : null}



<ShipmentKpiModals
          currentShipments={currentShipments}
          isAllShipmentFlowMetricsOpen={isAllShipmentFlowMetricsOpen}
          isAllShipmentKpisOpen={isAllShipmentKpisOpen}
          pastShipments={pastShipments}
          setIsAllShipmentFlowMetricsOpen={setIsAllShipmentFlowMetricsOpen}
          setIsAllShipmentKpisOpen={setIsAllShipmentKpisOpen}
          shipmentTimingMetrics={shipmentTimingMetrics}
          shipments={shipments}
        />

<InventoryDetailsModal
          detailsItem={detailsItem}
          setDetailsItem={setDetailsItem}
        />
    </main>
  );
}

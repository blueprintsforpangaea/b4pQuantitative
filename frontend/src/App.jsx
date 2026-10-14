import { useEffect, useRef, useState } from "react";

import StockAlerts from "./StockAlerts.jsx";
import Requests from "./Requests.jsx";
import SyncCell from "./SyncCell.jsx";
import { API_BASE, NON_INVENTORY_SHIPMENT_STORAGE_KEY, PALLET_MAP_STORAGE_KEY, SHIPMENT_STORAGE_KEY, tabs } from "./lib/config.js";
import { averageShipmentDays, parseLocalDate, todayIsoDate } from "./lib/dates.js";
import { formatNumber } from "./lib/format.js";
import { buildInventoryRows, inventoryStatusForItem } from "./lib/inventory.js";
import { canPlacePallet, clampPalletPosition, mergePalletLayout } from "./lib/palletMap.js";
import { defaultShipments, normalizePastShipmentStatus, normalizeRequestedQuantity, normalizeShipmentItem, normalizeShipmentType, requestedShipmentItemValue, withConsolidationCompletionDate } from "./lib/shipments.js";
import { applyDashboardTooltips } from "./lib/tooltips.js";
import TotalInventory from "./tabs/TotalInventory.jsx";
import InventoryKpis from "./tabs/InventoryKpis.jsx";
import Shipments from "./tabs/Shipments.jsx";
import ShipmentKpis from "./tabs/ShipmentKpis.jsx";
import ShipmentModals, { ShipmentActionModals } from "./components/ShipmentModals.jsx";
import { InventoryKpiModals, InventoryDetailsModal } from "./components/InventoryModals.jsx";
import ShipmentKpiModals from "./components/ShipmentKpiModals.jsx";

export default function App() {
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
  const [selectedPallets, setSelectedPallets] = useState([]);
  const [selectedBoxTypes, setSelectedBoxTypes] = useState([]);
  const [selectedWorkflowStatuses, setSelectedWorkflowStatuses] = useState([]);
  const [showAvailableItems, setShowAvailableItems] = useState(false);
  const [showNonAvailableItems, setShowNonAvailableItems] = useState(false);
  const [isInventoryFiltersOpen, setIsInventoryFiltersOpen] = useState(false);
  const [showFloatingInventoryAction, setShowFloatingInventoryAction] = useState(false);
  const [shipments, setShipments] = useState(defaultShipments);
  const [nonInventoryShipments, setNonInventoryShipments] = useState([]);
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
  const [pendingShipmentItems, setPendingShipmentItems] = useState([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState("__new__");
  const [newShipmentRecipientName, setNewShipmentRecipientName] = useState("");
  const [newShipmentType, setNewShipmentType] = useState("Local");
  const [newShipmentPointOfContact, setNewShipmentPointOfContact] = useState("");
  const [newShipmentRecipientPointOfContact, setNewShipmentRecipientPointOfContact] = useState("");
  const [newShipmentSupplyIds, setNewShipmentSupplyIds] = useState("");
  const [selectedInventoryIds, setSelectedInventoryIds] = useState([]);
  const [valuationRange, setValuationRange] = useState({ min: 0, max: 0 });
  const [currentShipmentSearchTerm, setCurrentShipmentSearchTerm] = useState("");
  const [pastShipmentSearchTerm, setPastShipmentSearchTerm] = useState("");
  const [currentShipmentTypeFilter, setCurrentShipmentTypeFilter] = useState("All");
  const [currentShipmentStatusFilter, setCurrentShipmentStatusFilter] = useState("All");
  const [pastShipmentTypeFilter, setPastShipmentTypeFilter] = useState("All");
  const [pastShipmentStatusDateFilter, setPastShipmentStatusDateFilter] = useState("creation");
  const [nonInventoryShipmentSearch, setNonInventoryShipmentSearch] = useState("");
  const [nonInventoryShipmentLocation, setNonInventoryShipmentLocation] = useState("All");
  const [nonInventoryValuationSort, setNonInventoryValuationSort] = useState("high-low");
  const [isCreateShipmentModalOpen, setIsCreateShipmentModalOpen] = useState(false);
  const [isNonInventoryShipmentModalOpen, setIsNonInventoryShipmentModalOpen] = useState(false);
  const [isShipmentValueDataOpen, setIsShipmentValueDataOpen] = useState(false);
  const [isShipmentItemsDataOpen, setIsShipmentItemsDataOpen] = useState(false);
  const [shipmentValueKpiYear, setShipmentValueKpiYear] = useState(() => new Date().getFullYear());
  const [shipmentItemsKpiYear, setShipmentItemsKpiYear] = useState(() => new Date().getFullYear());
  const [nonInventoryClinicName, setNonInventoryClinicName] = useState("");
  const [nonInventoryPointOfContact, setNonInventoryPointOfContact] = useState("");
  const [nonInventoryShipmentType, setNonInventoryShipmentType] = useState("Local");
  const [nonInventoryShipmentDate, setNonInventoryShipmentDate] = useState(todayIsoDate());
  const [nonInventoryValuation, setNonInventoryValuation] = useState("");
  const [detailsItem, setDetailsItem] = useState(null);
  const [returningShipmentItem, setReturningShipmentItem] = useState(null);
  const [returningShipmentItems, setReturningShipmentItems] = useState(null);
  const [requestingShipmentItem, setRequestingShipmentItem] = useState(null);
  const [consolidatingShipmentItem, setConsolidatingShipmentItem] = useState(null);
  const [bulkConsolidationCheck, setBulkConsolidationCheck] = useState(null);
  const [addingSupplyIdsShipmentId, setAddingSupplyIdsShipmentId] = useState(null);
  const [shipmentSupplyIdsInput, setShipmentSupplyIdsInput] = useState("");
  const [requestedUnitsValue, setRequestedUnitsValue] = useState("");
  const [expandedShipmentIds, setExpandedShipmentIds] = useState([]);
  const [editingShipmentField, setEditingShipmentField] = useState(null);
  const [editingShipmentValue, setEditingShipmentValue] = useState("");
  const [editingShipmentNotesId, setEditingShipmentNotesId] = useState(null);
  const [editingShipmentNotesValue, setEditingShipmentNotesValue] = useState("");
  const [shippingShipmentId, setShippingShipmentId] = useState(null);
  const [deliveringShipmentId, setDeliveringShipmentId] = useState(null);
  const [revertingDeliveredShipmentId, setRevertingDeliveredShipmentId] = useState(null);
  const [shipmentDate, setShipmentDate] = useState("");
  const [transportType, setTransportType] = useState("Car");
  const [transportTypeOther, setTransportTypeOther] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryDateMode, setDeliveryDateMode] = useState("date");
  const [shipmentNotes, setShipmentNotes] = useState("");
  const [activeExpirationPieLabel, setActiveExpirationPieLabel] = useState(null);
  const [activeDurationPieLabel, setActiveDurationPieLabel] = useState(null);
  const [activeCategoryPieLabel, setActiveCategoryPieLabel] = useState(null);
  const [activeValuePieLabel, setActiveValuePieLabel] = useState(null);
  const [activeBoxCategoryPieLabel, setActiveBoxCategoryPieLabel] = useState(null);
  const [activeSupplyStatusPieLabel, setActiveSupplyStatusPieLabel] = useState(null);
  const [isAllInventoryKpisOpen, setIsAllInventoryKpisOpen] = useState(false);
  const [isAllShipmentKpisOpen, setIsAllShipmentKpisOpen] = useState(false);
  const [isAllShipmentFlowMetricsOpen, setIsAllShipmentFlowMetricsOpen] = useState(false);
  const [isEditingPalletMap, setIsEditingPalletMap] = useState(false);
  const [savedPalletLayout, setSavedPalletLayout] = useState({});
  const [draftPalletLayout, setDraftPalletLayout] = useState({});
  const [draggingPallet, setDraggingPallet] = useState(null);
  const [activePalletId, setActivePalletId] = useState(null);
  const [focusedPastShipmentId, setFocusedPastShipmentId] = useState(null);
  const palletMapRef = useRef(null);
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
  useEffect(() => {
    try {
      const storedShipments = window.localStorage.getItem(SHIPMENT_STORAGE_KEY);
      if (storedShipments) {
        const parsedShipments = JSON.parse(storedShipments);
        const normalizedShipments = (parsedShipments.length > 0 ? parsedShipments : defaultShipments)
          .map((shipment) =>
            withConsolidationCompletionDate({
              ...shipment,
              shipmentType: normalizeShipmentType(shipment.shipmentType),
              filterMode:
                !shipment.filterMode || shipment.filterMode === "location"
                  ? "original"
                  : shipment.filterMode,
              isCompleted: Boolean(shipment.isCompleted),
              createdAt: shipment.createdAt || "",
              consolidationStartedAt: shipment.consolidationStartedAt || "",
              consolidationCompletedAt: shipment.consolidationCompletedAt || "",
              pastShipmentStatus: Boolean(shipment.isCompleted)
                ? normalizePastShipmentStatus(
                    shipment.pastShipmentStatus,
                    shipment.deliveryDate,
                    shipment.pastShipmentStatusOverride ||
                      (shipment.pastShipmentStatusManuallySet ? "Shipped" : "")
                  )
                : undefined,
              items: (shipment.items || []).map(normalizeShipmentItem),
            })
          );
        setShipments(normalizedShipments);
      }
    } catch (err) {
      console.error("Unable to restore shipments", err);
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(SHIPMENT_STORAGE_KEY, JSON.stringify(shipments));
    } catch (err) {
      console.error("Unable to persist shipments", err);
    }
  }, [shipments]);
  useEffect(() => {
    try {
      const storedShipments = window.localStorage.getItem(NON_INVENTORY_SHIPMENT_STORAGE_KEY);
      if (storedShipments) {
        const parsedShipments = JSON.parse(storedShipments);
        if (Array.isArray(parsedShipments)) {
          setNonInventoryShipments(
            parsedShipments.map((shipment) => ({
              ...shipment,
              shippedAt: shipment.shippedAt || shipment.createdAt || "",
            }))
          );
        }
      }
    } catch (err) {
      console.error("Unable to restore non-inventory shipments", err);
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        NON_INVENTORY_SHIPMENT_STORAGE_KEY,
        JSON.stringify(nonInventoryShipments)
      );
    } catch (err) {
      console.error("Unable to persist non-inventory shipments", err);
    }
  }, [nonInventoryShipments]);
  useEffect(() => {
    try {
      const storedLayout = window.localStorage.getItem(PALLET_MAP_STORAGE_KEY);
      if (storedLayout) {
        setSavedPalletLayout(JSON.parse(storedLayout));
      }
    } catch (err) {
      console.error("Unable to restore pallet layout", err);
    }
  }, []);
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
  const palletSummaries = Object.values(
    inventoryRowsWithShipmentStatus
      .filter((row) => row.palletNumber && row.palletNumber !== "Unassigned")
      .reduce((accumulator, row) => {
        const palletId = String(row.palletNumber);

        if (!accumulator[palletId]) {
          accumulator[palletId] = {
            id: palletId,
            label: `Pallet ${palletId}`,
            rows: [],
            totalSupplies: 0,
            boxKeys: new Set(),
            boxTypeCounts: {},
          };
        }

        accumulator[palletId].rows.push(row);
        accumulator[palletId].totalSupplies += Number(row.quantity) || 0;
        accumulator[palletId].boxKeys.add(`${row.boxType}|${row.boxNumber}`);

        const boxKey = `${row.boxType}|${row.boxNumber}`;
        if (!accumulator[palletId].seenBoxKeys) {
          accumulator[palletId].seenBoxKeys = new Set();
        }
        if (!accumulator[palletId].seenBoxKeys.has(boxKey)) {
          accumulator[palletId].seenBoxKeys.add(boxKey);
          accumulator[palletId].boxTypeCounts[row.boxType] =
            (accumulator[palletId].boxTypeCounts[row.boxType] || 0) + 1;
        }

        return accumulator;
      }, {})
  )
    .map((summary) => ({
      ...summary,
      boxBreakdown: allBoxTypes.map((boxType) => ({
        boxType,
        count: summary.boxTypeCounts[boxType] || 0,
      })),
      totalBoxes: summary.boxKeys.size,
    }))
    .sort((left, right) => Number(left.id) - Number(right.id));
  const palletIdKey = palletSummaries.map((summary) => summary.id).join("|");
  const unitPriceValues = inventoryRowsWithStatus.map((row) => row.unitPrice);
  const minUnitPrice = unitPriceValues.length > 0 ? Math.min(...unitPriceValues) : 0;
  const maxUnitPrice = unitPriceValues.length > 0 ? Math.max(...unitPriceValues) : 0;
  useEffect(() => {
    setValuationRange({ min: minUnitPrice, max: maxUnitPrice });
  }, [minUnitPrice, maxUnitPrice]);
  useEffect(() => {
    const nextLayout = mergePalletLayout(savedPalletLayout, palletSummaries.map((summary) => summary.id));
    if (JSON.stringify(nextLayout) !== JSON.stringify(savedPalletLayout)) {
      setSavedPalletLayout(nextLayout);
    }

    if (isEditingPalletMap) {
      const nextDraftLayout = mergePalletLayout(
        draftPalletLayout,
        palletSummaries.map((summary) => summary.id)
      );
      if (JSON.stringify(nextDraftLayout) !== JSON.stringify(draftPalletLayout)) {
        setDraftPalletLayout(nextDraftLayout);
      }
    }
  }, [palletIdKey, savedPalletLayout, draftPalletLayout, isEditingPalletMap]);
  useEffect(() => {
    try {
      window.localStorage.setItem(PALLET_MAP_STORAGE_KEY, JSON.stringify(savedPalletLayout));
    } catch (err) {
      console.error("Unable to persist pallet layout", err);
    }
  }, [savedPalletLayout]);
  useEffect(() => {
    if (
      !focusedPastShipmentId ||
      activeTab !== "shipments" ||
      activeShipmentSubtab !== "past"
    ) {
      return;
    }

    const target = document.getElementById(`past-shipment-${focusedPastShipmentId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setFocusedPastShipmentId(null);
    }
  }, [focusedPastShipmentId, activeTab, activeShipmentSubtab, shipments]);
  useEffect(() => {
    if (!draggingPallet || !isEditingPalletMap) {
      return undefined;
    }

    function handlePointerMove(event) {
      const canvasBounds = palletMapRef.current?.getBoundingClientRect();
      if (!canvasBounds) {
        return;
      }

      const unclampedPosition = {
        x: event.clientX - canvasBounds.left - draggingPallet.offsetX,
        y: event.clientY - canvasBounds.top - draggingPallet.offsetY,
      };
      const nextPosition = clampPalletPosition(unclampedPosition);

      setDraftPalletLayout((currentLayout) =>
        canPlacePallet(currentLayout, draggingPallet.palletId, nextPosition)
          ? { ...currentLayout, [draggingPallet.palletId]: nextPosition }
          : currentLayout
      );
    }

    function handlePointerUp() {
      setDraggingPallet(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draggingPallet, isEditingPalletMap]);
  function jumpToPastShipment(shipmentId, shipmentName, shipmentKind = "inventory") {
    setActiveTab("shipments");
    if (shipmentKind === "non-inventory") {
      setActiveShipmentSubtab("non-inventory");
      setNonInventoryShipmentSearch(shipmentName || "");
      return;
    }
    setActiveShipmentSubtab("past");
    setPastShipmentSearchTerm(shipmentName || "");
    setFocusedPastShipmentId(shipmentId);
  }
  function clearInventoryFilters() {
    setSelectedExpiration([]);
    setSelectedDuration([]);
    setSelectedCategories([]);
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
  const expiredInventoryUnits = inventoryRowsWithStatus
    .filter((row) => row.expirationDaysLeft !== null && row.expirationDaysLeft <= 0)
    .reduce((total, row) => total + (row.quantity || 0), 0);
  const expiringSoonInventoryUnits = inventoryRowsWithStatus
    .filter((row) => row.expirationDaysLeft !== null && row.expirationDaysLeft > 0 && row.expirationDaysLeft <= 90)
    .reduce((total, row) => total + (row.quantity || 0), 0);
  const averageBoxesPerPallet =
    (kpis?.pallet_count ?? 0) > 0 ? (kpis.box_count ?? 0) / kpis.pallet_count : 0;
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
          clearInventoryFilters={clearInventoryFilters}
          currentShipments={currentShipments}
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
          selectedInventoryIds={selectedInventoryIds}
          selectedPallets={selectedPallets}
          selectedWorkflowStatuses={selectedWorkflowStatuses}
          setIsInventoryFiltersOpen={setIsInventoryFiltersOpen}
          setIsShipmentModalOpen={setIsShipmentModalOpen}
          setNewShipmentPointOfContact={setNewShipmentPointOfContact}
          setNewShipmentRecipientName={setNewShipmentRecipientName}
          setNewShipmentRecipientPointOfContact={setNewShipmentRecipientPointOfContact}
          setNewShipmentSupplyIds={setNewShipmentSupplyIds}
          setNewShipmentType={setNewShipmentType}
          setPendingShipmentItems={setPendingShipmentItems}
          setSearchTerm={setSearchTerm}
          setSelectedBoxTypes={setSelectedBoxTypes}
          setSelectedCategories={setSelectedCategories}
          setSelectedDuration={setSelectedDuration}
          setSelectedExpiration={setSelectedExpiration}
          setSelectedInventoryIds={setSelectedInventoryIds}
          setSelectedPallets={setSelectedPallets}
          setSelectedShipmentId={setSelectedShipmentId}
          setSelectedWorkflowStatuses={setSelectedWorkflowStatuses}
          setShowAvailableItems={setShowAvailableItems}
          setShowNonAvailableItems={setShowNonAvailableItems}
          setValuationRange={setValuationRange}
          showAvailableItems={showAvailableItems}
          showFloatingInventoryAction={showFloatingInventoryAction}
          showNonAvailableItems={showNonAvailableItems}
          valuationRange={valuationRange}
        />
      ) : null}

      {!loading && !error && activeTab === "stock-alerts" ? <StockAlerts /> : null}

      {!loading && !error && activeTab === "requests" ? <Requests /> : null}

      {!loading && !error && activeTab === "kpis" ? (
<InventoryKpis
          activeBoxCategoryPieLabel={activeBoxCategoryPieLabel}
          activeCategoryPieLabel={activeCategoryPieLabel}
          activeDurationPieLabel={activeDurationPieLabel}
          activeExpirationPieLabel={activeExpirationPieLabel}
          activeSupplyStatusPieLabel={activeSupplyStatusPieLabel}
          activeValuePieLabel={activeValuePieLabel}
          averageBoxesPerPallet={averageBoxesPerPallet}
          clearInventoryFilters={clearInventoryFilters}
          draftPalletLayout={draftPalletLayout}
          expiredInventoryUnits={expiredInventoryUnits}
          expiringSoonInventoryUnits={expiringSoonInventoryUnits}
          inventoryRowsWithShipmentStatus={inventoryRowsWithShipmentStatus}
          inventoryRowsWithStatus={inventoryRowsWithStatus}
          isEditingPalletMap={isEditingPalletMap}
          items={items}
          kpis={kpis}
          maxUnitPrice={maxUnitPrice}
          minUnitPrice={minUnitPrice}
          palletMapRef={palletMapRef}
          palletSummaries={palletSummaries}
          savedPalletLayout={savedPalletLayout}
          setActiveBoxCategoryPieLabel={setActiveBoxCategoryPieLabel}
          setActiveCategoryPieLabel={setActiveCategoryPieLabel}
          setActiveDurationPieLabel={setActiveDurationPieLabel}
          setActiveExpirationPieLabel={setActiveExpirationPieLabel}
          setActivePalletId={setActivePalletId}
          setActiveSupplyStatusPieLabel={setActiveSupplyStatusPieLabel}
          setActiveTab={setActiveTab}
          setActiveValuePieLabel={setActiveValuePieLabel}
          setDraftPalletLayout={setDraftPalletLayout}
          setDraggingPallet={setDraggingPallet}
          setIsAllInventoryKpisOpen={setIsAllInventoryKpisOpen}
          setIsEditingPalletMap={setIsEditingPalletMap}
          setIsInventoryFiltersOpen={setIsInventoryFiltersOpen}
          setSavedPalletLayout={setSavedPalletLayout}
          setSelectedBoxTypes={setSelectedBoxTypes}
          setSelectedCategories={setSelectedCategories}
          setSelectedDuration={setSelectedDuration}
          setSelectedExpiration={setSelectedExpiration}
          setSelectedInventoryIds={setSelectedInventoryIds}
          setSelectedWorkflowStatuses={setSelectedWorkflowStatuses}
          setValuationRange={setValuationRange}
        />
      ) : null}

      {!loading && !error && activeTab === "shipments" ? (
<Shipments
          activeShipmentSubtab={activeShipmentSubtab}
          currentShipmentSearchTerm={currentShipmentSearchTerm}
          currentShipmentStatusFilter={currentShipmentStatusFilter}
          currentShipmentTypeFilter={currentShipmentTypeFilter}
          currentShipments={currentShipments}
          editingShipmentField={editingShipmentField}
          editingShipmentNotesId={editingShipmentNotesId}
          editingShipmentNotesValue={editingShipmentNotesValue}
          editingShipmentValue={editingShipmentValue}
          expandedShipmentIds={expandedShipmentIds}
          items={items}
          nonInventoryShipmentLocation={nonInventoryShipmentLocation}
          nonInventoryShipmentSearch={nonInventoryShipmentSearch}
          nonInventoryShipments={nonInventoryShipments}
          nonInventoryValuationSort={nonInventoryValuationSort}
          openDetailsModal={openDetailsModal}
          pastShipmentSearchTerm={pastShipmentSearchTerm}
          pastShipmentStatusDateFilter={pastShipmentStatusDateFilter}
          pastShipmentTypeFilter={pastShipmentTypeFilter}
          pastShipments={pastShipments}
          setActiveShipmentSubtab={setActiveShipmentSubtab}
          setAddingSupplyIdsShipmentId={setAddingSupplyIdsShipmentId}
          setBulkConsolidationCheck={setBulkConsolidationCheck}
          setConsolidatingShipmentItem={setConsolidatingShipmentItem}
          setCurrentShipmentSearchTerm={setCurrentShipmentSearchTerm}
          setCurrentShipmentStatusFilter={setCurrentShipmentStatusFilter}
          setCurrentShipmentTypeFilter={setCurrentShipmentTypeFilter}
          setDeliveringShipmentId={setDeliveringShipmentId}
          setDeliveryDate={setDeliveryDate}
          setDeliveryDateMode={setDeliveryDateMode}
          setEditingShipmentField={setEditingShipmentField}
          setEditingShipmentNotesId={setEditingShipmentNotesId}
          setEditingShipmentNotesValue={setEditingShipmentNotesValue}
          setEditingShipmentValue={setEditingShipmentValue}
          setExpandedShipmentIds={setExpandedShipmentIds}
          setIsCreateShipmentModalOpen={setIsCreateShipmentModalOpen}
          setIsNonInventoryShipmentModalOpen={setIsNonInventoryShipmentModalOpen}
          setNewShipmentPointOfContact={setNewShipmentPointOfContact}
          setNewShipmentRecipientName={setNewShipmentRecipientName}
          setNewShipmentRecipientPointOfContact={setNewShipmentRecipientPointOfContact}
          setNewShipmentSupplyIds={setNewShipmentSupplyIds}
          setNewShipmentType={setNewShipmentType}
          setNonInventoryClinicName={setNonInventoryClinicName}
          setNonInventoryPointOfContact={setNonInventoryPointOfContact}
          setNonInventoryShipmentDate={setNonInventoryShipmentDate}
          setNonInventoryShipmentLocation={setNonInventoryShipmentLocation}
          setNonInventoryShipmentSearch={setNonInventoryShipmentSearch}
          setNonInventoryShipmentType={setNonInventoryShipmentType}
          setNonInventoryValuation={setNonInventoryValuation}
          setNonInventoryValuationSort={setNonInventoryValuationSort}
          setPastShipmentSearchTerm={setPastShipmentSearchTerm}
          setPastShipmentStatusDateFilter={setPastShipmentStatusDateFilter}
          setPastShipmentTypeFilter={setPastShipmentTypeFilter}
          setRequestedUnitsValue={setRequestedUnitsValue}
          setRequestingShipmentItem={setRequestingShipmentItem}
          setReturningShipmentItem={setReturningShipmentItem}
          setReturningShipmentItems={setReturningShipmentItems}
          setRevertingDeliveredShipmentId={setRevertingDeliveredShipmentId}
          setShipmentDate={setShipmentDate}
          setShipmentNotes={setShipmentNotes}
          setShipmentSupplyIdsInput={setShipmentSupplyIdsInput}
          setShipments={setShipments}
          setShippingShipmentId={setShippingShipmentId}
          setTransportType={setTransportType}
          setTransportTypeOther={setTransportTypeOther}
          shipmentNotes={shipmentNotes}
          shipments={shipments}
        />
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
          shipmentValueKpiYear={shipmentValueKpiYear}
          shipments={shipments}
        />
      ) : null}

<ShipmentModals
          currentShipments={currentShipments}
          deliveryDate={deliveryDate}
          deliveryDateMode={deliveryDateMode}
          isCreateShipmentModalOpen={isCreateShipmentModalOpen}
          isNonInventoryShipmentModalOpen={isNonInventoryShipmentModalOpen}
          isShipmentItemsDataOpen={isShipmentItemsDataOpen}
          isShipmentModalOpen={isShipmentModalOpen}
          isShipmentValueDataOpen={isShipmentValueDataOpen}
          items={items}
          itemsFromSupplyIds={itemsFromSupplyIds}
          jumpToPastShipment={jumpToPastShipment}
          newShipmentPointOfContact={newShipmentPointOfContact}
          newShipmentRecipientName={newShipmentRecipientName}
          newShipmentRecipientPointOfContact={newShipmentRecipientPointOfContact}
          newShipmentSupplyIds={newShipmentSupplyIds}
          newShipmentType={newShipmentType}
          nonInventoryClinicName={nonInventoryClinicName}
          nonInventoryPointOfContact={nonInventoryPointOfContact}
          nonInventoryShipmentDate={nonInventoryShipmentDate}
          nonInventoryShipmentType={nonInventoryShipmentType}
          nonInventoryValuation={nonInventoryValuation}
          pendingShipmentItems={pendingShipmentItems}
          selectedShipmentId={selectedShipmentId}
          setActiveShipmentSubtab={setActiveShipmentSubtab}
          setActiveTab={setActiveTab}
          setDeliveryDate={setDeliveryDate}
          setDeliveryDateMode={setDeliveryDateMode}
          setIsCreateShipmentModalOpen={setIsCreateShipmentModalOpen}
          setIsNonInventoryShipmentModalOpen={setIsNonInventoryShipmentModalOpen}
          setIsShipmentItemsDataOpen={setIsShipmentItemsDataOpen}
          setIsShipmentModalOpen={setIsShipmentModalOpen}
          setIsShipmentValueDataOpen={setIsShipmentValueDataOpen}
          setNewShipmentPointOfContact={setNewShipmentPointOfContact}
          setNewShipmentRecipientName={setNewShipmentRecipientName}
          setNewShipmentRecipientPointOfContact={setNewShipmentRecipientPointOfContact}
          setNewShipmentSupplyIds={setNewShipmentSupplyIds}
          setNewShipmentType={setNewShipmentType}
          setNonInventoryClinicName={setNonInventoryClinicName}
          setNonInventoryPointOfContact={setNonInventoryPointOfContact}
          setNonInventoryShipmentDate={setNonInventoryShipmentDate}
          setNonInventoryShipmentType={setNonInventoryShipmentType}
          setNonInventoryShipments={setNonInventoryShipments}
          setNonInventoryValuation={setNonInventoryValuation}
          setPendingShipmentItems={setPendingShipmentItems}
          setSelectedInventoryIds={setSelectedInventoryIds}
          setSelectedShipmentId={setSelectedShipmentId}
          setShipmentDate={setShipmentDate}
          setShipmentNotes={setShipmentNotes}
          setShipments={setShipments}
          setShippingShipmentId={setShippingShipmentId}
          setTransportType={setTransportType}
          setTransportTypeOther={setTransportTypeOther}
          shipmentDate={shipmentDate}
          shipmentItemsByYearPoints={shipmentItemsByYearPoints}
          shipmentItemsKpiYear={shipmentItemsKpiYear}
          shipmentNotes={shipmentNotes}
          shipmentValueByYearPoints={shipmentValueByYearPoints}
          shipmentValueKpiYear={shipmentValueKpiYear}
          shipments={shipments}
          shippingShipmentId={shippingShipmentId}
          transportType={transportType}
          transportTypeOther={transportTypeOther}
        />

<InventoryKpiModals
          activePalletId={activePalletId}
          averageBoxesPerPallet={averageBoxesPerPallet}
          expiredInventoryUnits={expiredInventoryUnits}
          expiringSoonInventoryUnits={expiringSoonInventoryUnits}
          inventoryRowsWithShipmentStatus={inventoryRowsWithShipmentStatus}
          inventoryRowsWithStatus={inventoryRowsWithStatus}
          isAllInventoryKpisOpen={isAllInventoryKpisOpen}
          kpis={kpis}
          palletSummaries={palletSummaries}
          setActivePalletId={setActivePalletId}
          setIsAllInventoryKpisOpen={setIsAllInventoryKpisOpen}
        />

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

<ShipmentActionModals
          addingSupplyIdsShipmentId={addingSupplyIdsShipmentId}
          bulkConsolidationCheck={bulkConsolidationCheck}
          consolidatingShipmentItem={consolidatingShipmentItem}
          currentShipments={currentShipments}
          deliveringShipmentId={deliveringShipmentId}
          deliveryDate={deliveryDate}
          error={error}
          items={items}
          itemsFromSupplyIds={itemsFromSupplyIds}
          requestedUnitsValue={requestedUnitsValue}
          requestingShipmentItem={requestingShipmentItem}
          returningShipmentItem={returningShipmentItem}
          returningShipmentItems={returningShipmentItems}
          revertingDeliveredShipmentId={revertingDeliveredShipmentId}
          setAddingSupplyIdsShipmentId={setAddingSupplyIdsShipmentId}
          setBulkConsolidationCheck={setBulkConsolidationCheck}
          setConsolidatingShipmentItem={setConsolidatingShipmentItem}
          setDeliveringShipmentId={setDeliveringShipmentId}
          setDeliveryDate={setDeliveryDate}
          setRequestedUnitsValue={setRequestedUnitsValue}
          setRequestingShipmentItem={setRequestingShipmentItem}
          setReturningShipmentItem={setReturningShipmentItem}
          setReturningShipmentItems={setReturningShipmentItems}
          setRevertingDeliveredShipmentId={setRevertingDeliveredShipmentId}
          setShipmentNotes={setShipmentNotes}
          setShipmentSupplyIdsInput={setShipmentSupplyIdsInput}
          setShipments={setShipments}
          shipmentNotes={shipmentNotes}
          shipmentSupplyIdsInput={shipmentSupplyIdsInput}
          shipments={shipments}
        />
    </main>
  );
}

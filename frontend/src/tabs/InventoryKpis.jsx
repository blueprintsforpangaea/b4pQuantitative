import { useState } from "react";
import Breakdown, { BreakdownControls } from "../components/Breakdown.jsx";
import { buildBreakdown, inventoryTiles, latestPallet, palletIds } from "../lib/breakdown.js";
import { formatCurrency, formatNumber } from "../lib/format.js";
import { summarizeAllocations } from "../lib/shipments.js";

export default function InventoryKpis({
  allocations,
  allocationsByItem,
  clearInventoryFilters,
  inventoryRowsWithShipmentStatus,
  kpis,
  setActiveTab,
  setIsInventoryFiltersOpen,
  setSelectedCategories,
  setSelectedDuration,
  setSelectedExpiryTiers,
  setSelectedInventoryIds,
  setSelectedPallets,
  setSelectedWorkflowStatuses,
}) {
  const [dim, setDim] = useState("expiry");
  const [measure, setMeasure] = useState("units");
  const [chart, setChart] = useState("bars");
  const [pickedPallet, setPickedPallet] = useState("");

  const rows = inventoryRowsWithShipmentStatus;
  const tiles = inventoryTiles(rows, allocationsByItem, summarizeAllocations(allocations || []));
  const overall = buildBreakdown(rows, dim, measure);

  const pallets = palletIds(rows);
  const pallet = pallets.includes(pickedPallet) ? pickedPallet : latestPallet(rows);
  const palletRows = rows.filter((row) => row.palletNumber === pallet);
  const palletBreakdown = buildBreakdown(palletRows, dim, measure);
  const palletUnits = palletRows.reduce((total, row) => total + (row.quantity || 0), 0);

  const filterSetters = {
    tier: setSelectedExpiryTiers,
    category: setSelectedCategories,
    duration: setSelectedDuration,
    workflow: setSelectedWorkflowStatuses,
  };

  // Every tile and bar lands in Total Inventory with the matching filter applied.
  function openInventory({ filter = null, pallets: palletFilter = [] } = {}) {
    clearInventoryFilters();
    setSelectedInventoryIds([]);
    if (filter) {
      filterSetters[filter.type](filter.values);
    }
    setSelectedPallets(palletFilter);
    setIsInventoryFiltersOpen(false);
    setActiveTab("inventory");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  const tileList = [
    {
      question: "How much do we have?",
      value: formatNumber(tiles.totalUnits),
      unit: "units on hand",
      detail: `${formatCurrency(tiles.totalValue)} value · ${formatNumber(kpis?.pallet_count ?? pallets.length)} pallets`,
      filter: null,
    },
    {
      question: "What needs pulling now?",
      value: formatNumber(tiles.needsPulling),
      unit: "expired units",
      detail: `${formatNumber(tiles.expiredUnits)} expired on hand, minus units already pulled`,
      filter: { type: "tier", values: ["expired"] },
      tone: "expired",
    },
    {
      question: "What should ship next?",
      value: formatNumber(tiles.expiringUnits),
      unit: "units expiring within 90 days",
      detail: "Expiring in 90 days or less, not yet expired",
      filter: { type: "tier", values: ["d30", "d90"] },
      tone: "d30",
    },
    {
      question: "How much is already moving?",
      value: formatNumber(tiles.movingUnits),
      unit: "units pulled or consolidated",
      detail: `${formatNumber(tiles.pulledUnits)} pulled · ${formatNumber(tiles.consolidatedUnits)} consolidated`,
      filter: { type: "workflow", values: ["Pulled", "Consolidated"] },
      tone: "moving",
    },
  ];

  const controls = (
    <BreakdownControls
      dim={dim}
      measure={measure}
      chart={chart}
      onDim={setDim}
      onMeasure={setMeasure}
      onChart={setChart}
    />
  );

  return (
    <section className="panel">
      <div className="kpi-tiles">
        {tileList.map((tile) => (
          <button
            key={tile.question}
            type="button"
            className={`kpi-tile${tile.tone ? ` kpi-tile-${tile.tone}` : ""}`}
            onClick={() => openInventory({ filter: tile.filter })}
          >
            <span className="kpi-tile-question">{tile.question}</span>
            <span className="kpi-tile-value">{tile.value}</span>
            <span className="kpi-tile-unit">{tile.unit}</span>
            <span className="kpi-tile-detail">{tile.detail}</span>
            <span className="kpi-tile-link">View in Total Inventory</span>
          </button>
        ))}
      </div>

      <div className="breakdown-panel">
        <div className="breakdown-header">
          <h3>Inventory breakdown</h3>
          {controls}
        </div>
        <Breakdown
          segments={overall.segments}
          total={overall.total}
          measure={measure}
          chart={chart}
          ariaLabel="Inventory breakdown"
          onSelect={(segment) => openInventory({ filter: segment.filter })}
          emptyLabel="No inventory to break down yet."
        />
      </div>

      <div className="breakdown-panel">
        <div className="breakdown-header">
          <h3>Pallets</h3>
          <label className="pallet-picker">
            <span className="breakdown-control-label">Pallet</span>
            <select value={pallet} onChange={(event) => setPickedPallet(event.target.value)} disabled={pallets.length === 0}>
              {pallets.map((id) => (
                <option key={id} value={id}>
                  Pallet {id}{id === latestPallet(rows) ? " (latest)" : ""}
                </option>
              ))}
            </select>
          </label>
          <span className="breakdown-note">
            {pallet ? `${formatNumber(palletUnits)} units on pallet ${pallet}` : ""} · same breakdown and measure as above
          </span>
        </div>
        <Breakdown
          segments={palletBreakdown.segments}
          total={palletBreakdown.total}
          measure={measure}
          chart={chart}
          ariaLabel={`Pallet ${pallet} breakdown`}
          onSelect={(segment) => openInventory({ filter: segment.filter, pallets: [pallet] })}
          emptyLabel="No pallets yet."
        />
      </div>
    </section>
  );
}

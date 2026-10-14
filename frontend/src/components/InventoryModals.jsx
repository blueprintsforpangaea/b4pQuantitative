import { CompactPalletPieChart, MetricCard } from "./PieCharts.jsx";
import { colorForBoxType, colorForCategory, durationBucketColors, durationBucketOrder, expirationBucketColors, supplyStatusColors, supplyStatusOrder, valueBucketColors, valueBucketOrder } from "../lib/colors.js";
import { formatCurrency, formatNumber, percentOfTotal } from "../lib/format.js";
import { buildFacetCounts, valueBucketForUnitPrice } from "../lib/inventory.js";

export function InventoryKpiModals({
  activePalletId,
  averageBoxesPerPallet,
  expiredInventoryUnits,
  expiringSoonInventoryUnits,
  inventoryRowsWithShipmentStatus,
  inventoryRowsWithStatus,
  isAllInventoryKpisOpen,
  kpis,
  palletSummaries,
  setActivePalletId,
  setIsAllInventoryKpisOpen,
}) {
  const activePalletSummary =
    palletSummaries.find((summary) => summary.id === activePalletId) || null;

  const activePalletRows = activePalletSummary?.rows || [];

  const activePalletTotalSupplies = activePalletRows.reduce(
    (total, row) => total + (row.quantity || 0),
    0
  );

  const activePalletTotalBoxes = activePalletSummary?.totalBoxes || 0;

  const activePalletTotalValue = activePalletRows.reduce(
    (total, row) => total + (row.valuation || 0),
    0
  );

  const activePalletExpiredSupplies = activePalletRows
    .filter((row) => row.expirationDaysLeft !== null && row.expirationDaysLeft <= 0)
    .reduce((total, row) => total + (row.quantity || 0), 0);

  const activePalletExpiringSoonSupplies = activePalletRows
    .filter(
      (row) =>
        row.expirationDaysLeft !== null &&
        row.expirationDaysLeft > 0 &&
        row.expirationDaysLeft <= 90
    )
    .reduce((total, row) => total + (row.quantity || 0), 0);

  const palletExpirationLegendData = buildFacetCounts(activePalletRows, "expirationFilter", [
    "Already expired",
    "0-90 days",
    "90-180 days",
    "180-365 days",
    "365+ days",
    "No expiration date",
  ])
    .map((bucket) => {
      const matchingRows = activePalletRows.filter((row) => row.expirationFilter === bucket.value);
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: bucket.value,
        value: rawItems,
        total: activePalletTotalSupplies,
        percentage: percentOfTotal(rawItems, activePalletTotalSupplies),
        color: expirationBucketColors[bucket.value] || "#4a90e2",
      };
    })
    .filter((segment) => segment.value > 0);

  const palletDurationLegendData = durationBucketOrder
    .map((bucketLabel) => {
      const matchingRows = activePalletRows.filter((row) => row.durationFilter === bucketLabel);
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: bucketLabel,
        value: rawItems,
        total: activePalletTotalSupplies,
        percentage: percentOfTotal(rawItems, activePalletTotalSupplies),
        color: durationBucketColors[bucketLabel] || "#4a90e2",
      };
    })
    .filter((segment) => segment.value > 0);

  const palletCategoryLegendData = buildFacetCounts(activePalletRows, "category")
    .map((bucket, index) => {
      const matchingRows = activePalletRows.filter((row) => row.category === bucket.value);
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: bucket.value,
        value: rawItems,
        total: activePalletTotalSupplies,
        percentage: percentOfTotal(rawItems, activePalletTotalSupplies),
        color: colorForCategory(bucket.value),
      };
    })
    .filter((segment) => segment.value > 0);

  const palletValueLegendData = valueBucketOrder
    .map((bucketLabel) => {
      const matchingRows = activePalletRows.filter(
        (row) => valueBucketForUnitPrice(row.unitPrice) === bucketLabel
      );
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: bucketLabel,
        value: rawItems,
        total: activePalletTotalSupplies,
        percentage: percentOfTotal(rawItems, activePalletTotalSupplies),
        color: valueBucketColors[bucketLabel],
      };
    })
    .filter((segment) => segment.value > 0);

  const palletBoxLegendData = buildFacetCounts(activePalletRows, "boxType")
    .map((bucket, index) => {
      const matchingRows = activePalletRows.filter((row) => row.boxType === bucket.value);
      const uniqueBoxes = new Set(
        matchingRows.map((row) => `${row.boxType}|${row.boxNumber}`)
      );
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: bucket.value,
        value: rawItems,
        total: activePalletTotalSupplies,
        percentage: percentOfTotal(rawItems, activePalletTotalSupplies),
        boxCount: uniqueBoxes.size,
        color: colorForBoxType(index),
      };
    })
    .filter((segment) => segment.value > 0);

  const palletSupplyStatusLegendData = supplyStatusOrder
    .map((statusLabel) => {
      const matchingRows = activePalletRows.filter((row) => row.supplyWorkflowStatus === statusLabel);
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: statusLabel,
        value: rawItems,
        total: activePalletTotalSupplies,
        percentage: percentOfTotal(rawItems, activePalletTotalSupplies),
        color: supplyStatusColors[statusLabel],
      };
    })
    .filter((segment) => segment.value > 0);

  const palletDetailCharts = [
    {
      title: "Expiration Summary",
      ariaLabel: "Pallet expiration breakdown",
      segments: palletExpirationLegendData,
      tooltipFormatter: (segment) => [
        segment.label,
        `${formatNumber(segment.value)} supplies`,
        `${segment.percentage}% of pallet supplies`,
      ],
    },
    {
      title: "Duration Summary",
      ariaLabel: "Pallet duration breakdown",
      segments: palletDurationLegendData,
      tooltipFormatter: (segment) => [
        segment.label,
        `${formatNumber(segment.value)} supplies`,
        `${segment.percentage}% of pallet supplies`,
      ],
    },
    {
      title: "Category Summary",
      ariaLabel: "Pallet category breakdown",
      segments: palletCategoryLegendData,
      tooltipFormatter: (segment) => [
        segment.label,
        `${formatNumber(segment.value)} supplies`,
        `${segment.percentage}% of pallet supplies`,
      ],
    },
    {
      title: "Value Summary",
      ariaLabel: "Pallet value bucket breakdown",
      segments: palletValueLegendData,
      tooltipFormatter: (segment) => [
        segment.label,
        `${formatNumber(segment.value)} supplies`,
        `${segment.percentage}% of pallet supplies`,
      ],
    },
    {
      title: "Box Category",
      ariaLabel: "Pallet box category breakdown",
      segments: palletBoxLegendData,
      tooltipFormatter: (segment) => [
        segment.label,
        `${formatNumber(segment.value)} supplies`,
        `${segment.percentage}% of pallet supplies`,
        `${formatNumber(segment.boxCount)} boxes`,
      ],
    },
    {
      title: "Supply Status",
      ariaLabel: "Pallet supply status breakdown",
      segments: palletSupplyStatusLegendData,
      tooltipFormatter: (segment) => [
        segment.label,
        `${formatNumber(segment.value)} supplies`,
        `${segment.percentage}% of pallet supplies`,
      ],
    },
  ];

  const slowMovingInventoryUnits = inventoryRowsWithStatus
    .filter((row) => row.daysInWarehouse > 180)
    .reduce((total, row) => total + (row.quantity || 0), 0);

  const assignedSupplyUnits = inventoryRowsWithShipmentStatus
    .filter((row) => row.supplyWorkflowStatus === "Pulled" || row.supplyWorkflowStatus === "Consolidated")
    .reduce((total, row) => total + (row.quantity || 0), 0);

  return (
    <>
      {activePalletSummary ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setActivePalletId(null)}>
          <div
            className="shipment-modal shipment-modal-large pallet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pallet-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Pallet Details</p>
                <h2 id="pallet-modal-title">{activePalletSummary.label}</h2>
                <div className="pallet-modal-metrics">
                  <div className="pallet-modal-metric-card">
                    <span>Total Supplies</span>
                    <strong>{formatNumber(activePalletTotalSupplies)}</strong>
                  </div>
                  <div className="pallet-modal-metric-card">
                    <span>Total Boxes</span>
                    <strong>{formatNumber(activePalletTotalBoxes)}</strong>
                  </div>
                  <div className="pallet-modal-metric-card">
                    <span>Total Value</span>
                    <strong>{formatCurrency(activePalletTotalValue)}</strong>
                  </div>
                </div>
                <p className="pallet-modal-supplies">
                  {formatNumber(activePalletExpiredSupplies)} supplies expired,{" "}
                  {formatNumber(activePalletExpiringSoonSupplies)} expiring in 90 days
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setActivePalletId(null)}>
                x
              </button>
            </div>

            <div className="pallet-mini-chart-grid">
              {palletDetailCharts.map((chart) => (
                <CompactPalletPieChart
                  key={`${activePalletSummary.id}-${chart.title}`}
                  title={chart.title}
                  ariaLabel={chart.ariaLabel}
                  segments={chart.segments}
                  tooltipFormatter={chart.tooltipFormatter}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isAllInventoryKpisOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setIsAllInventoryKpisOpen(false)}
        >
          <div
            className="shipment-modal inventory-kpi-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-kpi-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Inventory KPIs</p>
                <h2 id="inventory-kpi-modal-title">Full operating snapshot</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsAllInventoryKpisOpen(false)}
                aria-label="Close full KPI view"
              >
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <div className="metrics-grid inventory-kpi-modal-grid">
                <MetricCard label="Total Units On Hand" value={formatNumber(kpis.total_raw_items)} />
                <MetricCard label="Expired Units" value={formatNumber(expiredInventoryUnits)} />
                <MetricCard
                  label="Expiring In 90 Days"
                  value={formatNumber(expiringSoonInventoryUnits)}
                />
                <MetricCard
                  label="Slow-Moving Units"
                  value={formatNumber(slowMovingInventoryUnits)}
                />
                <MetricCard label="Assigned Units" value={formatNumber(assignedSupplyUnits)} />
                <MetricCard label="Pallet Count" value={formatNumber(kpis.pallet_count)} />
                <MetricCard label="Box Count" value={formatNumber(kpis.box_count)} />
                <MetricCard
                  label="Avg Boxes per Pallet"
                  value={averageBoxesPerPallet.toFixed(1)}
                />
                <MetricCard
                  label="Average Duration (Days)"
                  value={(kpis.avg_duration_per_item ?? 0).toFixed(1)}
                />
                <MetricCard
                  label="Estimated Inventory Value"
                  value={formatCurrency(kpis.total_value)}
                  valueClassName="metric-value-compact"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function InventoryDetailsModal({
  detailsItem,
  setDetailsItem,
}) {
  function closeDetailsModal() {
    setDetailsItem(null);
  }

  return (
    <>
      {detailsItem ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDetailsModal}>
          <div
            className="shipment-modal shipment-modal-large"
            role="dialog"
            aria-modal="true"
            aria-labelledby="details-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Supply Details</p>
                <h2 id="details-modal-title">Supply #{detailsItem.supplyId}</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeDetailsModal}>
                x
              </button>
            </div>

            <div className="details-grid">
              <div className="details-item"><span>Supply ID</span><strong>{detailsItem.supplyId}</strong></div>
              <div className="details-item"><span>Days in Warehouse</span><strong>{formatNumber(detailsItem.daysInWarehouse)}</strong></div>
              <div className="details-item"><span>Manufacturer Name</span><strong>{detailsItem.manufacturer}</strong></div>
              <div className="details-item"><span>Category</span><strong>{detailsItem.category}</strong></div>
              <div className="details-item"><span>General</span><strong>{detailsItem.generalSupply}</strong></div>
              <div className="details-item"><span>Name</span><strong>{detailsItem.exactSupplyName}</strong></div>
              <div className="details-item"><span>Location Information</span><strong>{detailsItem.locationInfo}</strong></div>
              <div className="details-item"><span>Quantity</span><strong>{formatNumber(detailsItem.quantity)}</strong></div>
              <div className="details-item"><span>Price per Unit</span><strong>{formatCurrency(detailsItem.unitPrice)}</strong></div>
              <div className="details-item"><span>Total Price</span><strong>{formatCurrency(detailsItem.valuation)}</strong></div>
              <div className="details-item"><span>Expiration Date</span><strong>{detailsItem.expirationDate}</strong></div>
              <div className="details-item">
                <span>Image URL</span>
                <strong>
                  {detailsItem.imageUrl ? (
                    <a href={detailsItem.imageUrl} target="_blank" rel="noreferrer">
                      Open image link
                    </a>
                  ) : (
                    "Not available"
                  )}
                </strong>
              </div>
            </div>

            {detailsItem.imageUrl ? (
              <div className="details-image-wrap">
                <img className="details-image" src={detailsItem.imageUrl} alt={detailsItem.exactSupplyName} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

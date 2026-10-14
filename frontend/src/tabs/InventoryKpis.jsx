import { MetricCard, PieChartCard } from "../components/PieCharts.jsx";
import { buildPieChartBackground, buildPieChartSegments } from "../lib/charts.js";
import { colorForBoxType, colorForCategory, durationBucketColors, durationBucketOrder, expirationBucketColors, supplyStatusColors, supplyStatusOrder, valueBucketColors, valueBucketOrder } from "../lib/colors.js";
import { formatNumber, percentOfTotal } from "../lib/format.js";
import { buildFacetCounts, valueBucketForUnitPrice } from "../lib/inventory.js";
import { mergePalletLayout } from "../lib/palletMap.js";

export default function InventoryKpis({
  activeBoxCategoryPieLabel,
  activeCategoryPieLabel,
  activeDurationPieLabel,
  activeExpirationPieLabel,
  activeSupplyStatusPieLabel,
  activeValuePieLabel,
  averageBoxesPerPallet,
  clearInventoryFilters,
  draftPalletLayout,
  expiredInventoryUnits,
  expiringSoonInventoryUnits,
  inventoryRowsWithShipmentStatus,
  inventoryRowsWithStatus,
  isEditingPalletMap,
  items,
  kpis,
  maxUnitPrice,
  minUnitPrice,
  palletMapRef,
  palletSummaries,
  savedPalletLayout,
  setActiveBoxCategoryPieLabel,
  setActiveCategoryPieLabel,
  setActiveDurationPieLabel,
  setActiveExpirationPieLabel,
  setActivePalletId,
  setActiveSupplyStatusPieLabel,
  setActiveTab,
  setActiveValuePieLabel,
  setDraftPalletLayout,
  setDraggingPallet,
  setIsAllInventoryKpisOpen,
  setIsEditingPalletMap,
  setIsInventoryFiltersOpen,
  setSavedPalletLayout,
  setSelectedBoxTypes,
  setSelectedCategories,
  setSelectedDuration,
  setSelectedExpiration,
  setSelectedInventoryIds,
  setSelectedWorkflowStatuses,
  setValuationRange,
}) {
  const visiblePalletLayout = isEditingPalletMap ? draftPalletLayout : savedPalletLayout;

  function startEditingPalletConformation() {
    setDraftPalletLayout(mergePalletLayout(savedPalletLayout, palletSummaries.map((summary) => summary.id)));
    setIsEditingPalletMap(true);
  }

  function savePalletConformation() {
    setSavedPalletLayout(mergePalletLayout(draftPalletLayout, palletSummaries.map((summary) => summary.id)));
    setIsEditingPalletMap(false);
    setDraggingPallet(null);
  }

  function handlePalletPointerDown(event, palletId) {
    if (!isEditingPalletMap) {
      return;
    }

    const canvasBounds = palletMapRef.current?.getBoundingClientRect();
    const palletPosition = visiblePalletLayout[palletId];
    if (!canvasBounds || !palletPosition) {
      return;
    }

    setDraggingPallet({
      palletId,
      offsetX: event.clientX - canvasBounds.left - palletPosition.x,
      offsetY: event.clientY - canvasBounds.top - palletPosition.y,
    });
  }

  function openChartSegmentInInventory(filterType, rawLabel) {
    clearInventoryFilters();
    setSelectedInventoryIds([]);

    if (filterType === "expiration") {
      const expirationLabelMap = {
        "Already Expired": "Already expired",
        "No expiration": "No expiration date",
        "No expiration date": "No expiration date",
      };
      setSelectedExpiration([expirationLabelMap[rawLabel] || rawLabel]);
    } else if (filterType === "duration") {
      setSelectedDuration([rawLabel]);
    } else if (filterType === "category") {
      setSelectedCategories([rawLabel]);
    } else if (filterType === "box") {
      setSelectedBoxTypes([rawLabel]);
    } else if (filterType === "workflow") {
      setSelectedWorkflowStatuses([rawLabel]);
    } else if (filterType === "value") {
      const valueRanges = {
        "$0-$50": { min: 0, max: Math.min(49.999, maxUnitPrice) },
        "$50-$100": { min: 50, max: Math.min(99.999, maxUnitPrice) },
        "$100-$200": { min: 100, max: Math.min(199.999, maxUnitPrice) },
        "$200+": { min: 200, max: maxUnitPrice },
      };
      setValuationRange(valueRanges[rawLabel] || { min: minUnitPrice, max: maxUnitPrice });
    }

    setActiveTab("inventory");
    setIsInventoryFiltersOpen(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const expiryRanges = Object.entries(kpis?.expiry_ranges || {});

  const expirationChartSegments = expiryRanges
    .map(([range, values]) => ({
      label: range,
      value: values?.raw_items ?? 0,
      entries: values?.entries ?? 0,
      color: expirationBucketColors[range] || "#4a90e2",
    }))
    .filter((segment) => segment.value > 0);

  const totalExpirationChartItems = expirationChartSegments.reduce(
    (total, segment) => total + segment.value,
    0
  );

  const expirationChartData = expirationChartSegments.map((segment) => ({
    ...segment,
    total: totalExpirationChartItems,
    percentage: percentOfTotal(segment.value, totalExpirationChartItems),
  }));

  const expirationPieBackground = buildPieChartBackground(expirationChartData);

  const expirationPieSegments = buildPieChartSegments(expirationChartData);

  const durationChartData = durationBucketOrder.map((bucketLabel) => {
    const matchingRows = inventoryRowsWithStatus.filter(
      (row) => row.durationFilter === bucketLabel
    );
    const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

    return {
      label: bucketLabel,
      value: rawItems,
      entries: matchingRows.length,
      color: durationBucketColors[bucketLabel] || "#4a90e2",
    };
  });

  const totalDurationChartItems = durationChartData.reduce(
    (total, segment) => total + segment.value,
    0
  );

  const durationChartLegendData = durationChartData.map((segment) => ({
    ...segment,
    total: totalDurationChartItems,
    percentage: percentOfTotal(segment.value, totalDurationChartItems),
  }));

  const durationPieBackground = buildPieChartBackground(
    durationChartLegendData.filter((segment) => segment.value > 0)
  );

  const durationPieSegments = buildPieChartSegments(
    durationChartLegendData.filter((segment) => segment.value > 0)
  );

  const categoryChartData = buildFacetCounts(inventoryRowsWithStatus, "category")
    .map((bucket, index) => {
      const matchingRows = inventoryRowsWithStatus.filter((row) => row.category === bucket.value);
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: bucket.value,
        value: rawItems,
        entries: bucket.count,
        color: colorForCategory(bucket.value),
      };
    })
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));

  const totalCategoryChartItems = categoryChartData.reduce(
    (total, segment) => total + segment.value,
    0
  );

  const categoryChartLegendData = categoryChartData.map((segment) => ({
    ...segment,
    total: totalCategoryChartItems,
    percentage: percentOfTotal(segment.value, totalCategoryChartItems),
  }));

  const categoryPieBackground = buildPieChartBackground(
    categoryChartLegendData.filter((segment) => segment.value > 0)
  );

  const categoryPieSegments = buildPieChartSegments(
    categoryChartLegendData.filter((segment) => segment.value > 0)
  );

  const valueBucketChartData = valueBucketOrder.map((bucketLabel) => {
    const matchingRows = inventoryRowsWithShipmentStatus.filter(
      (row) => valueBucketForUnitPrice(row.unitPrice) === bucketLabel
    );
    const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

    return {
      label: bucketLabel,
      value: rawItems,
      color: valueBucketColors[bucketLabel],
    };
  });

  const totalValueBucketItems = valueBucketChartData.reduce(
    (total, segment) => total + segment.value,
    0
  );

  const valueBucketLegendData = valueBucketChartData.map((segment) => ({
    ...segment,
    total: totalValueBucketItems,
    percentage: percentOfTotal(segment.value, totalValueBucketItems),
  }));

  const valueBucketPieBackground = buildPieChartBackground(
    valueBucketLegendData.filter((segment) => segment.value > 0)
  );

  const valueBucketPieSegments = buildPieChartSegments(
    valueBucketLegendData.filter((segment) => segment.value > 0)
  );

  const boxCategoryChartData = buildFacetCounts(inventoryRowsWithShipmentStatus, "boxType")
    .map((bucket, index) => {
      const matchingRows = inventoryRowsWithShipmentStatus.filter((row) => row.boxType === bucket.value);
      const uniqueBoxes = new Set(
        matchingRows.map((row) => `${row.palletNumber}|${row.boxType}|${row.boxNumber}`)
      );
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: bucket.value,
        value: rawItems,
        boxCount: uniqueBoxes.size,
        color: colorForBoxType(index),
      };
    });

  const totalBoxCategoryItems = boxCategoryChartData.reduce(
    (total, segment) => total + segment.value,
    0
  );

  const boxCategoryLegendData = boxCategoryChartData.map((segment) => ({
    ...segment,
    total: totalBoxCategoryItems,
    percentage: percentOfTotal(segment.value, totalBoxCategoryItems),
  }));

  const boxCategoryPieBackground = buildPieChartBackground(
    boxCategoryLegendData.filter((segment) => segment.value > 0)
  );

  const boxCategoryPieSegments = buildPieChartSegments(
    boxCategoryLegendData.filter((segment) => segment.value > 0)
  );

  const supplyStatusChartData = supplyStatusOrder.map((statusLabel) => {
    const matchingRows = inventoryRowsWithShipmentStatus.filter(
      (row) => row.supplyWorkflowStatus === statusLabel
    );
    const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

    return {
      label: statusLabel,
      value: rawItems,
      color: supplyStatusColors[statusLabel],
    };
  });

  const totalSupplyStatusItems = supplyStatusChartData.reduce(
    (total, segment) => total + segment.value,
    0
  );

  const supplyStatusLegendData = supplyStatusChartData.map((segment) => ({
    ...segment,
    total: totalSupplyStatusItems,
    percentage: percentOfTotal(segment.value, totalSupplyStatusItems),
  }));

  const supplyStatusPieBackground = buildPieChartBackground(
    supplyStatusLegendData.filter((segment) => segment.value > 0)
  );

  const supplyStatusPieSegments = buildPieChartSegments(
    supplyStatusLegendData.filter((segment) => segment.value > 0)
  );

  const uniqueCategories = new Set(
    inventoryRowsWithStatus.map((row) => row.category).filter(Boolean)
  ).size;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="section-label">Inventory KPIs</p>
          <h2>Current operating snapshot</h2>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setIsAllInventoryKpisOpen(true)}
        >
          View all 10 KPIs
        </button>
      </div>

      <div className="metrics-grid metrics-grid-primary">
        <MetricCard label="Total Units On Hand" value={formatNumber(kpis.total_raw_items)} />
        <MetricCard label="Expired Units" value={formatNumber(expiredInventoryUnits)} />
        <MetricCard label="Expiring In 90 Days" value={formatNumber(expiringSoonInventoryUnits)} />
        <MetricCard label="Pallet Count" value={formatNumber(kpis.pallet_count)} />
        <MetricCard label="Box Count" value={formatNumber(kpis.box_count)} />
        <MetricCard label="Avg Boxes per Pallet" value={averageBoxesPerPallet.toFixed(1)} />
      </div>

      <div className="kpi-analytics-grid">
        <div className="summary-card kpi-card-half">
          <div className="panel-header">
            <div>
              <p className="section-label">Expiration Summary</p>
              <h3>Inventory at a glance by expiration window</h3>
            </div>
          </div>

          {expirationChartData.length > 0 ? (
            <PieChartCard
              title="Supplies by expiration bucket"
              ariaLabel="Pie chart of inventory by expiration bucket"
              totalItems={totalExpirationChartItems}
              segments={expirationPieSegments}
              legendSegments={expirationChartData}
              background={expirationPieBackground}
              activeLabel={activeExpirationPieLabel}
              onHover={setActiveExpirationPieLabel}
              onSegmentClick={(segment) =>
                openChartSegmentInInventory("expiration", segment.label)
              }
            />
          ) : (
            <p>No expiration data is available yet.</p>
          )}
        </div>

        <div className="summary-card kpi-card-half">
          <div className="panel-header">
            <div>
              <p className="section-label">Duration Summary</p>
              <h3>Inventory at a glance by warehouse duration</h3>
            </div>
          </div>

          {durationChartLegendData.length > 0 ? (
            <PieChartCard
              title="Supplies by duration bucket"
              ariaLabel="Pie chart of inventory by duration bucket"
              totalItems={totalDurationChartItems}
              segments={durationPieSegments}
              legendSegments={durationChartLegendData}
              background={durationPieBackground}
              activeLabel={activeDurationPieLabel}
              onHover={setActiveDurationPieLabel}
              onSegmentClick={(segment) =>
                openChartSegmentInInventory("duration", segment.label)
              }
            />
          ) : (
            <p>No duration data is available yet.</p>
          )}
        </div>

        <div className="summary-card kpi-card-full">
          <div className="panel-header">
            <div>
              <p className="section-label">Category Summary</p>
              <h3>Inventory at a glance by supply category</h3>
            </div>
            <span className="pill">{formatNumber(uniqueCategories)} categories</span>
          </div>

          {categoryChartLegendData.length > 0 ? (
            <PieChartCard
              title="Supplies by category"
              ariaLabel="Pie chart of inventory by supply category"
              totalItems={totalCategoryChartItems}
              segments={categoryPieSegments}
              legendSegments={categoryChartLegendData}
              background={categoryPieBackground}
              activeLabel={activeCategoryPieLabel}
              onHover={setActiveCategoryPieLabel}
              cardClassName="category-pie-card"
              onSegmentClick={(segment) =>
                openChartSegmentInInventory("category", segment.label)
              }
            />
          ) : (
            <p>No category data is available yet.</p>
          )}
        </div>

        <div className="summary-card kpi-card-third">
          <div className="panel-header">
            <div>
              <p className="section-label">Value Summary</p>
              <h3>Inventory by unit price bucket</h3>
            </div>
          </div>

          {valueBucketLegendData.length > 0 ? (
            <PieChartCard
              title="Supplies by price per unit"
              ariaLabel="Pie chart of inventory by price per unit bucket"
              totalItems={totalValueBucketItems}
              segments={valueBucketPieSegments}
              legendSegments={valueBucketLegendData}
              background={valueBucketPieBackground}
              activeLabel={activeValuePieLabel}
              onHover={setActiveValuePieLabel}
              cardClassName="kpi-compact-card"
              onSegmentClick={(segment) =>
                openChartSegmentInInventory("value", segment.label)
              }
            />
          ) : (
            <p>No value data is available yet.</p>
          )}
        </div>

        <div className="summary-card kpi-card-third">
          <div className="panel-header">
            <div>
              <p className="section-label">Box Category</p>
              <h3>Inventory by box category</h3>
            </div>
          </div>

          {boxCategoryLegendData.length > 0 ? (
            <PieChartCard
              title="Supplies by box category"
              ariaLabel="Pie chart of inventory by box category"
              totalItems={totalBoxCategoryItems}
              segments={boxCategoryPieSegments}
              legendSegments={boxCategoryLegendData}
              background={boxCategoryPieBackground}
              activeLabel={activeBoxCategoryPieLabel}
              onHover={setActiveBoxCategoryPieLabel}
              cardClassName="kpi-compact-card"
              onSegmentClick={(segment) =>
                openChartSegmentInInventory("box", segment.label)
              }
              renderLegendDetail={(segment) =>
                `${formatNumber(segment.value)} items • ${segment.percentage}% of raw items • ${formatNumber(segment.boxCount)} boxes`
              }
            />
          ) : (
            <p>No box category data is available yet.</p>
          )}
        </div>

        <div className="summary-card kpi-card-third">
          <div className="panel-header">
            <div>
              <p className="section-label">Supply Status</p>
              <h3>Inventory by workflow status</h3>
            </div>
          </div>

          {supplyStatusLegendData.length > 0 ? (
            <PieChartCard
              title="Supplies by current status"
              ariaLabel="Pie chart of inventory by current supply status"
              totalItems={totalSupplyStatusItems}
              segments={supplyStatusPieSegments}
              legendSegments={supplyStatusLegendData}
              background={supplyStatusPieBackground}
              activeLabel={activeSupplyStatusPieLabel}
              onHover={setActiveSupplyStatusPieLabel}
              cardClassName="kpi-compact-card"
              onSegmentClick={(segment) =>
                openChartSegmentInInventory("workflow", segment.label)
              }
            />
          ) : (
            <p>No supply status data is available yet.</p>
          )}
        </div>
      </div>

      <div className="summary-card pallet-map-card">
        <div className="panel-header">
          <div>
            <p className="section-label">Pallet Map</p>
            <h3>Warehouse pallet layout</h3>
          </div>
          <div className="pallet-map-actions">
            {!isEditingPalletMap ? (
              <button
                type="button"
                className="secondary-button"
                onClick={startEditingPalletConformation}
              >
                Edit Pallet Conformation
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                onClick={savePalletConformation}
              >
                Save Conformation
              </button>
            )}
          </div>
        </div>

        <div className="pallet-map-scroll">
          <div
            ref={palletMapRef}
            className={isEditingPalletMap ? "pallet-map-canvas is-editing" : "pallet-map-canvas"}
          >
            {palletSummaries.map((summary) => {
              const position = visiblePalletLayout[summary.id] || { x: 0, y: 0 };

              return (
                <div
                  key={summary.id}
                  className={isEditingPalletMap ? "pallet-card is-editing" : "pallet-card"}
                  style={{ left: position.x, top: position.y }}
                  onPointerDown={(event) => handlePalletPointerDown(event, summary.id)}
                >
                  <div className="pallet-card-header">
                    <strong>{summary.label}</strong>
                    <button
                      type="button"
                      className="info-icon-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setActivePalletId(summary.id);
                      }}
                      aria-label={`Open pallet details for ${summary.label}`}
                    >
                      ⓘ
                    </button>
                  </div>
                  <div className="pallet-card-copy">
                    <span>{formatNumber(summary.totalSupplies)} supplies</span>
                    <span>{formatNumber(summary.totalBoxes)} boxes</span>
                  </div>
                  <div className="pallet-card-box-list">
                    {summary.boxBreakdown.map((entry) => (
                      <span key={`${summary.id}-${entry.boxType}`} className="pallet-box-pill">
                        {entry.boxType}: {formatNumber(entry.count)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

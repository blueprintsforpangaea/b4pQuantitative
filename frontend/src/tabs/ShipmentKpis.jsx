import ShipmentComparison from "../components/ShipmentComparison.jsx";
import { MetricCard } from "../components/PieCharts.jsx";
import { ShipmentBarChart, ShipmentItemsLineChart, ShipmentValueLineChart } from "../components/ShipmentCharts.jsx";
import { formatAverageDays, formatCurrency, formatNumber } from "../lib/format.js";
import { getShipmentStatus, normalizePastShipmentStatus, normalizeShipmentType, requestedShipmentItemValue, shipmentTypeOptions } from "../lib/shipments.js";

export default function ShipmentKpis({
  activeShipmentKpiSubtab,
  currentShipments,
  items,
  jumpToPastShipment,
  setActiveShipmentKpiSubtab,
  setActiveShipmentSubtab,
  setActiveTab,
  setIsAllShipmentFlowMetricsOpen,
  setIsAllShipmentKpisOpen,
  setIsShipmentItemsDataOpen,
  setIsShipmentValueDataOpen,
  setShipmentItemsKpiYear,
  setShipmentValueKpiYear,
  shipmentItemsByYearPoints,
  shipmentItemsKpiYear,
  shipmentTimingMetrics,
  shipmentValueByYearPoints,
  shipmentValueEntries = [],
  shipmentValueKpiYear,
  shipments,
}) {
  const currentCalendarYear = new Date().getFullYear();

  const shipmentsByType = shipmentTypeOptions.map((type) => ({
    type,
    count: shipments.filter((shipment) => normalizeShipmentType(shipment.shipmentType) === type).length,
  }));

  const shipmentStatusCounts = [
    {
      label: "Planning",
      count: shipments.filter(
        (shipment) => !shipment.isCompleted && getShipmentStatus(shipment) === "Planning"
      ).length,
    },
    {
      label: "Consolidating",
      count: shipments.filter(
        (shipment) => !shipment.isCompleted && getShipmentStatus(shipment) === "Consolidating"
      ).length,
    },
    {
      label: "Consolidation Complete",
      count: shipments.filter(
        (shipment) =>
          !shipment.isCompleted && getShipmentStatus(shipment) === "Consolidation Complete"
      ).length,
    },
    {
      label: "Shipped",
      count: shipments.filter(
        (shipment) =>
          shipment.isCompleted &&
          normalizePastShipmentStatus(
            shipment.pastShipmentStatus,
            shipment.deliveryDate,
            shipment.pastShipmentStatusOverride ||
              (shipment.pastShipmentStatusManuallySet ? "Shipped" : "")
          ) === "Shipped"
      ).length,
    },
    {
      label: "Delivered",
      count: shipments.filter(
        (shipment) =>
          shipment.isCompleted &&
          normalizePastShipmentStatus(
            shipment.pastShipmentStatus,
            shipment.deliveryDate,
            shipment.pastShipmentStatusOverride ||
              (shipment.pastShipmentStatusManuallySet ? "Shipped" : "")
          ) === "Delivered"
      ).length,
    },
  ];

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="section-label">Shipment KPIs</p>
          <h2>Shipment activity and outbound flow</h2>
        </div>
      </div>

      <div className="shipment-subtabs shipment-kpi-subtabs" role="tablist" aria-label="Shipment KPI views">
        <button
          type="button"
          className={
            activeShipmentKpiSubtab === "overview"
              ? "shipment-subtab active"
              : "shipment-subtab"
          }
          onClick={() => setActiveShipmentKpiSubtab("overview")}
        >
          Shipment Activity
        </button>
        <button
          type="button"
          className={
            activeShipmentKpiSubtab === "flow-time"
              ? "shipment-subtab active"
              : "shipment-subtab"
          }
          onClick={() => setActiveShipmentKpiSubtab("flow-time")}
        >
          Shipment Flow Time
        </button>
      </div>

      {activeShipmentKpiSubtab === "overview" ? (
        <>
      <ShipmentComparison entries={shipmentValueEntries} />
      <div className="shipment-kpi-overview-split">
        <div className="shipment-kpi-summary-pane">
          <div className="shipment-kpi-pane-header">
            <div>
              <p className="section-label">KPI Summary</p>
              <h3>Current shipment activity</h3>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setIsAllShipmentKpisOpen(true)}
            >
              View all 10 KPIs
            </button>
          </div>
          <div className="metrics-grid metrics-grid-single">
            <MetricCard
              label="Current Shipments"
              value={formatNumber(currentShipments.length)}
            />
          </div>
        </div>

        <div className="shipment-kpi-current-table-panel">
          <div className="shipment-kpi-pane-header">
            <div>
              <p className="section-label">Current Shipments</p>
              <h3>Active shipment overview</h3>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setActiveTab("shipments");
                setActiveShipmentSubtab("current");
              }}
            >
              View shipments
            </button>
          </div>

          <div className="shipment-kpi-table-wrap">
            <table className="shipment-kpi-table">
              <thead>
                <tr>
                  <th>Shipment</th>
                  <th>Status</th>
                  <th>Supplies</th>
                  <th>Valuation</th>
                </tr>
              </thead>
              <tbody>
                {currentShipments.map((shipment) => {
                  const shipmentStatus = getShipmentStatus(shipment);
                  const shipmentStatusClass = shipmentStatus.toLowerCase().replace(/\s+/g, "-");

                  return (
                  <tr key={shipment.id}>
                    <td>{shipment.recipientName}</td>
                    <td>
                      <span className={`shipment-kpi-status shipment-kpi-status-${shipmentStatusClass}`}>
                        {shipmentStatus}
                      </span>
                    </td>
                    <td>{formatNumber(shipment.items.length)}</td>
                    <td>
                      {formatCurrency(
                        shipment.items.reduce(
                          (total, item) => total + requestedShipmentItemValue(item),
                          0
                        )
                      )}
                    </td>
                  </tr>
                  );
                })}
                {currentShipments.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="empty-state-cell">
                      No current shipments.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="shipment-kpi-grid">
        <div className="shipment-kpi-column">
          <div className="summary-card shipment-mix-card">
            <div className="panel-header">
              <div>
                <p className="section-label">Shipment Mix</p>
                <h3>Shipments by destination type</h3>
              </div>
            </div>

            <div className="expiry-chart-card">
              <ShipmentBarChart data={shipmentsByType.map((entry) => ({
                label: entry.type,
                count: entry.count,
              }))} />
            </div>
          </div>

          <div className="summary-card shipment-status-card">
            <div className="panel-header">
              <div>
                <p className="section-label">Shipment Status</p>
                <h3>Shipments by current status</h3>
              </div>
            </div>

            <div className="expiry-chart-card">
              <ShipmentBarChart data={shipmentStatusCounts.map((entry) => ({
                label: entry.label,
                count: entry.count,
              }))} />
            </div>
          </div>
        </div>

        <div className="shipment-kpi-column">
          <div className="summary-card">
            <div className="panel-header">
              <div>
                <p className="section-label">Shipment Value by Year</p>
                <h3>Shipment values and cumulative total in {shipmentValueKpiYear}</h3>
              </div>
              <button
                type="button"
                className="secondary-button"
                title="View every shipment value data point"
                onClick={() => setIsShipmentValueDataOpen(true)}
              >
                View all data points
              </button>
            </div>

            <div className="expiry-chart-card">
              {shipmentValueByYearPoints.length > 0 ? (
                <ShipmentValueLineChart
                  points={shipmentValueByYearPoints}
                  xAxisEndLabel="Dec 31"
                  onSelectShipment={jumpToPastShipment}
                />
              ) : (
                <p>No shipped-value history is available for {shipmentValueKpiYear}.</p>
              )}
            </div>
            <div className="shipment-year-navigation" aria-label="Shipment value graph year">
              <button
                type="button"
                className="secondary-button"
                title={`View shipment values for ${shipmentValueKpiYear - 1}`}
                onClick={() => setShipmentValueKpiYear((year) => year - 1)}
              >
                &larr;
              </button>
              <strong>{shipmentValueKpiYear}</strong>
              <button
                type="button"
                className="secondary-button"
                disabled={shipmentValueKpiYear >= currentCalendarYear}
                title={
                  shipmentValueKpiYear >= currentCalendarYear
                    ? "Future years are not available"
                    : `View shipment values for ${shipmentValueKpiYear + 1}`
                }
                onClick={() =>
                  setShipmentValueKpiYear((year) => Math.min(currentCalendarYear, year + 1))
                }
              >
                &rarr;
              </button>
            </div>
          </div>

          <div className="summary-card">
            <div className="panel-header">
              <div>
                <p className="section-label">Shipment Items by Year</p>
                <h3>Cumulative total items shipped in {shipmentItemsKpiYear}</h3>
              </div>
              <button
                type="button"
                className="secondary-button"
                title="View every shipment item data point"
                onClick={() => setIsShipmentItemsDataOpen(true)}
              >
                View all data points
              </button>
            </div>

            <div className="expiry-chart-card">
              {shipmentItemsByYearPoints.length > 0 ? (
                <ShipmentItemsLineChart
                  points={shipmentItemsByYearPoints}
                  xAxisEndLabel="Dec 31"
                  onSelectShipment={jumpToPastShipment}
                />
              ) : (
                <p>No shipped-item history is available for {shipmentItemsKpiYear}.</p>
              )}
            </div>
            <div className="shipment-year-navigation" aria-label="Shipment item graph year">
              <button
                type="button"
                className="secondary-button"
                title={`View shipment items for ${shipmentItemsKpiYear - 1}`}
                onClick={() => setShipmentItemsKpiYear((year) => year - 1)}
              >
                &larr;
              </button>
              <strong>{shipmentItemsKpiYear}</strong>
              <button
                type="button"
                className="secondary-button"
                disabled={shipmentItemsKpiYear >= currentCalendarYear}
                title={
                  shipmentItemsKpiYear >= currentCalendarYear
                    ? "Future years are not available"
                    : `View shipment items for ${shipmentItemsKpiYear + 1}`
                }
                onClick={() =>
                  setShipmentItemsKpiYear((year) => Math.min(currentCalendarYear, year + 1))
                }
              >
                &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>
        </>
      ) : null}

      {activeShipmentKpiSubtab === "flow-time" ? (
        <div className="shipment-flow-time-view">
      <div className="panel-header shipment-flow-metrics-header">
        <div>
          <p className="section-label">Shipment flow time metrics</p>
          <h3>Shipment flow time metrics</h3>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setIsAllShipmentFlowMetricsOpen(true)}
        >
          View all 10 KPIs
        </button>
      </div>

      <div className="metrics-grid shipment-timing-grid shipment-timing-summary-grid">
        {shipmentTimingMetrics
          .filter((metric) => metric.label !== "Avg Consolidation Time")
          .map((metric) => (
          <MetricCard
            key={`${metric.scope}-${metric.label}`}
            label={`${metric.scope} ${metric.label}`}
            value={formatAverageDays(metric.value)}
            valueClassName="metric-value-compact"
          />
          ))}
      </div>

      <div className="kpi-note-card">
        <p className="section-label">Next Metrics To Add</p>
        <p>
          Fill rate and request-to-shipment time will need request dates and requested quantities
          added to the shipment data model.
        </p>
      </div>
        </div>
      ) : null}
    </section>
  );
}

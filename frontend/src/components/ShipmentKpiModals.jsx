import { MetricCard } from "./PieCharts.jsx";
import { daysBetweenDates } from "../lib/dates.js";
import { average, formatAverageDays, formatCurrency, formatNumber } from "../lib/format.js";
import { normalizeRequestedQuantity, requestedShipmentItemValue } from "../lib/shipments.js";

export default function ShipmentKpiModals({
  currentShipments,
  isAllShipmentFlowMetricsOpen,
  isAllShipmentKpisOpen,
  pastShipments,
  setIsAllShipmentFlowMetricsOpen,
  setIsAllShipmentKpisOpen,
  shipmentTimingMetrics,
  shipments,
}) {
  const totalShippedUnits = pastShipments.reduce(
    (total, shipment) =>
      total +
      shipment.items.reduce(
        (shipmentTotal, item) => shipmentTotal + normalizeRequestedQuantity(item),
        0
      ),
    0
  );

  const totalShippedValuation = pastShipments.reduce(
    (total, shipment) =>
      total + shipment.items.reduce((shipmentTotal, item) => shipmentTotal + requestedShipmentItemValue(item), 0),
    0
  );

  const uniqueShipmentRecipients = new Set(
    shipments.map((shipment) => shipment.recipientName).filter(Boolean)
  ).size;

  const recurringShipmentCount = shipments.reduce((total, shipment, _, allShipments) => {
    if (!shipment.recipientName) {
      return total;
    }

    const normalizedRecipientName = shipment.recipientName.trim().toLowerCase();
    const matchingRecipientCount = allShipments.filter(
      (candidate) => candidate.recipientName?.trim().toLowerCase() === normalizedRecipientName
    ).length;

    return total + (matchingRecipientCount > 1 ? 1 : 0);
  }, 0);

  const averageShipmentValuation = average(
    pastShipments.map((shipment) =>
      shipment.items.reduce((shipmentTotal, item) => shipmentTotal + requestedShipmentItemValue(item), 0)
    )
  );

  const averageUnitsPerShippedShipment = average(
    pastShipments.map((shipment) =>
      shipment.items.reduce(
        (shipmentTotal, item) => shipmentTotal + normalizeRequestedQuantity(item),
        0
      )
    )
  );

  const nearExpiryShipmentUnits = pastShipments.reduce(
    (total, shipment) =>
      total +
      shipment.items
        .filter(
          (item) => {
            const daysUntilExpirationAtShipment = daysBetweenDates(
              item.expirationDate,
              shipment.shippedAt
            );

            return (
              daysUntilExpirationAtShipment !== null &&
              daysUntilExpirationAtShipment <= 90
            );
          }
        )
        .reduce(
          (shipmentTotal, item) => shipmentTotal + normalizeRequestedQuantity(item),
          0
        ),
    0
  );

  return (
    <>
      {isAllShipmentKpisOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setIsAllShipmentKpisOpen(false)}
        >
          <div
            className="shipment-modal inventory-kpi-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-kpi-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Shipment KPIs</p>
                <h2 id="shipment-kpi-modal-title">Full shipment activity snapshot</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsAllShipmentKpisOpen(false)}
                aria-label="Close full shipment KPI view"
              >
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <div className="metrics-grid inventory-kpi-modal-grid">
                <MetricCard label="Total Shipments" value={formatNumber(shipments.length)} />
                <MetricCard
                  label="Current Shipments"
                  value={formatNumber(currentShipments.length)}
                />
                <MetricCard
                  label="Completed Shipments"
                  value={formatNumber(pastShipments.length)}
                />
                <MetricCard
                  label="Recurring Shipments"
                  value={formatNumber(recurringShipmentCount)}
                />
                <MetricCard
                  label="Unique Recipients"
                  value={formatNumber(uniqueShipmentRecipients)}
                />
                <MetricCard
                  label="Total Units Shipped"
                  value={formatNumber(totalShippedUnits)}
                />
                <MetricCard
                  label="Avg Units Per Shipment"
                  value={formatNumber(Math.round(averageUnitsPerShippedShipment))}
                />
                <MetricCard
                  label="Total Valuation Shipped"
                  value={formatCurrency(totalShippedValuation)}
                />
                <MetricCard
                  label="Avg Valuation Per Shipment"
                  value={formatCurrency(averageShipmentValuation)}
                />
                <MetricCard
                  label="Near-Expiry Units In Shipments"
                  value={formatNumber(nearExpiryShipmentUnits)}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isAllShipmentFlowMetricsOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setIsAllShipmentFlowMetricsOpen(false)}
        >
          <div
            className="shipment-modal inventory-kpi-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-flow-metrics-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Shipment Flow Time Metrics</p>
                <h2 id="shipment-flow-metrics-modal-title">All 10 flow-time metrics</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsAllShipmentFlowMetricsOpen(false)}
                aria-label="Close full shipment flow-time metric view"
              >
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <div className="metrics-grid inventory-kpi-modal-grid">
                {shipmentTimingMetrics.map((metric) => (
                  <MetricCard
                    key={`${metric.scope}-${metric.label}`}
                    label={`${metric.scope} ${metric.label}`}
                    value={formatAverageDays(metric.value)}
                    valueClassName="metric-value-compact"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

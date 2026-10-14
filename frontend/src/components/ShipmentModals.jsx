import { MONTH_AXIS_LABELS } from "../lib/charts.js";
import { parseLocalDate } from "../lib/dates.js";
import { formatCurrency, formatNumber } from "../lib/format.js";

// Data-point modals for the Shipment KPIs tab.
export default function ShipmentModals({
  isShipmentItemsDataOpen,
  isShipmentValueDataOpen,
  jumpToPastShipment,
  setActiveShipmentSubtab,
  setActiveTab,
  setIsShipmentItemsDataOpen,
  setIsShipmentValueDataOpen,
  shipmentItemsByYearPoints,
  shipmentItemsKpiYear,
  shipmentValueByYearPoints,
  shipmentValueKpiYear,
}) {
  const shipmentValuePointsByMonth = MONTH_AXIS_LABELS.map((month, monthIndex) => ({
    month,
    points: shipmentValueByYearPoints.filter((point) => {
      const shippedDate = parseLocalDate(point.shipmentDateLabel);
      return Boolean(shippedDate) && shippedDate.getMonth() === monthIndex;
    }),
  }));

  const shipmentItemPointsByMonth = MONTH_AXIS_LABELS.map((month, monthIndex) => ({
    month,
    points: shipmentItemsByYearPoints.filter((point) => {
      const shippedDate = parseLocalDate(point.shipmentDateLabel);
      return Boolean(shippedDate) && shippedDate.getMonth() === monthIndex;
    }),
  }));

  return (
    <>
      {isShipmentValueDataOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setIsShipmentValueDataOpen(false)}
        >
          <div
            className="shipment-modal shipment-modal-large shipment-value-data-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-value-data-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Shipment Value by Year</p>
                <h2 id="shipment-value-data-modal-title">
                  All shipment value data points for {shipmentValueKpiYear}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsShipmentValueDataOpen(false)}
              >
                x
              </button>
            </div>

            <div className="shipment-value-month-list">
              {shipmentValuePointsByMonth.map(({ month, points }) => (
                <section className="shipment-value-month-group" key={month}>
                  <div className="shipment-value-month-heading">
                    <h3>{month}</h3>
                    <span>{formatNumber(points.length)} data {points.length === 1 ? "point" : "points"}</span>
                  </div>
                  {points.length > 0 ? (
                    <div className="shipment-value-point-grid">
                      {points.map((point) => (
                        <button
                          type="button"
                          className="shipment-value-point-card"
                          key={`${point.shipmentKind}-${point.shipmentId}-${point.dayOffset}`}
                          title={`Open ${point.label}`}
                          onClick={() => {
                            setIsShipmentValueDataOpen(false);
                            jumpToPastShipment(
                              point.shipmentId,
                              point.label,
                              point.shipmentKind
                            );
                          }}
                        >
                          <strong>{point.label}</strong>
                          <span>{point.shipmentDateLabel}</span>
                          <span>
                            {point.shipmentKind === "non-inventory"
                              ? "Non-inventory shipment"
                              : "Inventory shipment"}
                          </span>
                          <span>{formatCurrency(point.shipmentValue)} shipment value</span>
                          <span>{formatCurrency(point.cumulativeValue)} running total</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="shipment-value-month-empty">No shipment data for this month.</p>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isShipmentItemsDataOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setIsShipmentItemsDataOpen(false)}
        >
          <div
            className="shipment-modal shipment-modal-large shipment-value-data-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-items-data-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Shipment Items by Year</p>
                <h2 id="shipment-items-data-modal-title">
                  All shipment item data points for {shipmentItemsKpiYear}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsShipmentItemsDataOpen(false)}
              >
                x
              </button>
            </div>

            <div className="shipment-value-month-list">
              {shipmentItemPointsByMonth.map(({ month, points }) => (
                <section className="shipment-value-month-group" key={month}>
                  <div className="shipment-value-month-heading">
                    <h3>{month}</h3>
                    <span>{formatNumber(points.length)} data {points.length === 1 ? "point" : "points"}</span>
                  </div>
                  {points.length > 0 ? (
                    <div className="shipment-value-point-grid">
                      {points.map((point) => (
                        <button
                          type="button"
                          className="shipment-value-point-card"
                          key={`${point.shipmentId}-${point.dayOffset}`}
                          title={`Open ${point.label}`}
                          onClick={() => {
                            setIsShipmentItemsDataOpen(false);
                            jumpToPastShipment(point.shipmentId, point.label, "inventory");
                          }}
                        >
                          <strong>{point.label}</strong>
                          <span>{point.shipmentDateLabel}</span>
                          <span>Inventory shipment</span>
                          <span>{formatNumber(point.shipmentItems)} items added</span>
                          <span>{formatNumber(point.cumulativeItems)} items running total</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="shipment-value-month-empty">No shipment data for this month.</p>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

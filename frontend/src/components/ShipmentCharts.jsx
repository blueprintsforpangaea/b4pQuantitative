import { useState } from "react";
import { MONTH_AXIS_LABELS, buildPieChartBackground, buildPieChartSegments, shipmentChartAxisMax, shipmentItemsAxisMax, shipmentValueAxisMax } from "../lib/charts.js";
import { colorForCategory, expirationBucketColors } from "../lib/colors.js";
import { expirationBucket } from "../lib/dates.js";
import { formatCompactCurrency, formatCurrency, formatNumber, percentOfTotal } from "../lib/format.js";
import { buildFacetCounts } from "../lib/inventory.js";
import { normalizeRequestedQuantity, requestedShipmentItemValue } from "../lib/shipments.js";

export function ShipmentDistributionChart({ shipmentItems }) {
  const [activeLabel, setActiveLabel] = useState(null);

  const chartData = buildFacetCounts(shipmentItems, "category")
    .map((bucket, index) => {
      const matchingItems = shipmentItems.filter((item) => item.category === bucket.value);
      const rawItems = matchingItems.reduce(
        (total, item) => total + normalizeRequestedQuantity(item),
        0
      );
      const valuation = matchingItems.reduce(
        (total, item) => total + requestedShipmentItemValue(item),
        0
      );

      return {
        label: bucket.value,
        value: rawItems,
        valuation,
        color: colorForCategory(bucket.value),
      };
    })
    .filter((segment) => segment.value > 0)
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));

  const totalItems = chartData.reduce((total, segment) => total + segment.value, 0);
  const legendSegments = chartData.map((segment) => ({
    ...segment,
    total: totalItems,
    percentage: percentOfTotal(segment.value, totalItems),
  }));
  const pieSegments = buildPieChartSegments(legendSegments);
  const activeSegment =
    legendSegments.find((segment) => segment.label === activeLabel) || legendSegments[0] || null;

  if (!legendSegments.length) {
    return (
      <div className="shipment-distribution-card">
        <span className="shipment-status-label">Supply Distribution</span>
        <p className="shipment-distribution-empty">No supply distribution yet.</p>
      </div>
    );
  }

  return (
    <div className="shipment-distribution-card">
      <span className="shipment-status-label">Supply Distribution</span>
      <div
        className="shipment-distribution-chart"
        role="img"
        aria-label="Pie chart of shipment supply distribution by category"
        onMouseLeave={() => setActiveLabel(null)}
      >
        <div
          className="shipment-distribution-pie"
          style={{ background: buildPieChartBackground(legendSegments) }}
        >
          <svg className="pie-slice-layer" viewBox="0 0 200 200" aria-hidden="true">
            {pieSegments.map((segment) => (
              <path
                key={segment.label}
                d={segment.path}
                className={
                  (activeLabel || activeSegment?.label) === segment.label
                    ? "pie-slice-hotspot active"
                    : "pie-slice-hotspot"
                }
                onPointerEnter={() => setActiveLabel(segment.label)}
                onPointerMove={() => setActiveLabel(segment.label)}
              />
            ))}
          </svg>
          <div className="shipment-distribution-center">
            <strong>{formatNumber(totalItems)}</strong>
            <span>items</span>
          </div>
        </div>
      </div>
      {activeSegment ? (
        <div className="shipment-distribution-tooltip">
          <strong>{activeSegment.label}</strong>
          <span>{formatNumber(activeSegment.value)} raw item supplies</span>
          <span>{activeSegment.percentage}% of total supplies</span>
          <span>{formatCurrency(activeSegment.valuation)} valuation</span>
        </div>
      ) : null}
    </div>
  );
}

export function ShipmentExpirationChart({ shipmentItems }) {
  const [activeLabel, setActiveLabel] = useState(null);
  const bucketOrder = [
    "Already expired",
    "0-90 days",
    "90-180 days",
    "180-365 days",
    "365+ days",
    "No expiration date",
  ];
  const chartData = bucketOrder
    .map((label) => {
      const matchingItems = shipmentItems.filter(
        (item) =>
          (item.expirationFilter ||
            expirationBucket(item.expirationRaw || item.expiration_date || null)) === label
      );

      return {
        label,
        value: matchingItems.reduce(
          (total, item) => total + normalizeRequestedQuantity(item),
          0
        ),
        entries: matchingItems.length,
        color: expirationBucketColors[label] || "#4a90e2",
      };
    })
    .filter((segment) => segment.value > 0);
  const totalItems = chartData.reduce((total, segment) => total + segment.value, 0);
  const legendSegments = chartData.map((segment) => ({
    ...segment,
    total: totalItems,
    percentage: percentOfTotal(segment.value, totalItems),
  }));
  const pieSegments = buildPieChartSegments(legendSegments);
  const activeSegment =
    legendSegments.find((segment) => segment.label === activeLabel) || legendSegments[0] || null;

  if (!legendSegments.length) {
    return (
      <div className="shipment-distribution-card">
        <span className="shipment-status-label">Expiration Summary</span>
        <p className="shipment-distribution-empty">No expiration data yet.</p>
      </div>
    );
  }

  return (
    <div className="shipment-distribution-card">
      <span className="shipment-status-label">Expiration Summary</span>
      <div
        className="shipment-distribution-chart"
        role="img"
        aria-label="Pie chart of shipment supplies by expiration bucket"
        onMouseLeave={() => setActiveLabel(null)}
      >
        <div
          className="shipment-distribution-pie"
          style={{ background: buildPieChartBackground(legendSegments) }}
        >
          <svg className="pie-slice-layer" viewBox="0 0 200 200" aria-hidden="true">
            {pieSegments.map((segment) => (
              <path
                key={segment.label}
                d={segment.path}
                className={
                  (activeLabel || activeSegment?.label) === segment.label
                    ? "pie-slice-hotspot active"
                    : "pie-slice-hotspot"
                }
                onPointerEnter={() => setActiveLabel(segment.label)}
                onPointerMove={() => setActiveLabel(segment.label)}
              />
            ))}
          </svg>
          <div className="shipment-distribution-center">
            <strong>{formatNumber(totalItems)}</strong>
            <span>items</span>
          </div>
        </div>
      </div>
      {activeSegment ? (
        <div className="shipment-distribution-tooltip">
          <strong>{activeSegment.label}</strong>
          <span>{formatNumber(activeSegment.value)} raw item supplies</span>
          <span>{activeSegment.percentage}% of total supplies</span>
        </div>
      ) : null}
    </div>
  );
}

export function ShipmentBarChart({ data, variant = "primary" }) {
  const axisMax = shipmentChartAxisMax(data.map((entry) => entry.count));
  const ticks = Array.from({ length: 6 }, (_, index) => {
    const value = Math.round(((5 - index) / 5) * axisMax);
    return value;
  });
  const plotHeight = 220;

  return (
    <div className="shipment-bar-chart">
      <div className="shipment-bar-chart-y-axis">
        {ticks.map((tickValue) => (
          <span key={tickValue}>{formatNumber(tickValue)}</span>
        ))}
      </div>
      <div className="shipment-bar-chart-plot">
        <div className="shipment-bar-chart-grid" aria-hidden="true">
          {ticks.map((tickValue) => (
            <span key={`grid-${tickValue}`} />
          ))}
        </div>
        <div className="shipment-bar-chart-bars">
          {data.map((entry) => {
            const rawHeight = axisMax > 0 ? (entry.count / axisMax) * plotHeight : 0;
            const height = entry.count > 0 ? Math.max(0, rawHeight - 0.5) : 0;

            return (
              <div className="shipment-bar-chart-column" key={entry.label}>
                <div className="shipment-bar-chart-bar-wrap">
                  <span
                    className="shipment-bar-chart-count"
                    style={{ bottom: `${height + 6}px` }}
                  >
                    {formatNumber(entry.count)}
                  </span>
                  {entry.count > 0 ? (
                    <div
                      className={
                        variant === "secondary"
                          ? "shipment-bar-chart-bar shipment-bar-chart-bar-secondary"
                          : "shipment-bar-chart-bar"
                      }
                      style={{ height: `${height}px` }}
                    />
                  ) : null}
                </div>
                <strong className="shipment-bar-chart-label">{entry.label}</strong>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ShipmentValueLineChart({ points, xAxisEndLabel, onSelectShipment }) {
  const plotWidth = 560;
  const plotHeight = 240;
  const axisMax = shipmentValueAxisMax(points.map((point) => point.shipmentValue));
  const yTicks = Array.from({ length: 5 }, (_, index) => ((4 - index) / 4) * axisMax);
  const [activePointKey, setActivePointKey] = useState(null);
  const coordinates = points.map((point) => ({
    ...point,
    x: (point.dayOffset / point.totalDays) * plotWidth,
    y: plotHeight - (point.shipmentValue / axisMax) * plotHeight,
  }));
  const activePoint =
    coordinates.find((point) => `${point.shipmentId}-${point.dayOffset}` === activePointKey) || null;
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <div className="shipment-line-chart">
      <div className="shipment-line-chart-y-axis">
        {yTicks.map((tick) => (
          <span key={tick}>{formatCompactCurrency(tick)}</span>
        ))}
      </div>
      <div className="shipment-line-chart-plot" onMouseLeave={() => setActivePointKey(null)}>
        <div className="shipment-line-chart-grid" aria-hidden="true">
          {yTicks.map((tick) => (
            <span key={`line-${tick}`} />
          ))}
        </div>
        <svg
          className="shipment-line-chart-svg"
          viewBox={`0 0 ${plotWidth} ${plotHeight}`}
          preserveAspectRatio="none"
          aria-label="Shipment value by year line chart"
          role="img"
        >
          {coordinates.length > 1 ? (
            <path className="shipment-line-chart-path" d={linePath} />
          ) : null}
          {coordinates.map((point) => (
            <g key={`${point.shipmentId}-${point.dayOffset}`}>
              <circle
                className="shipment-line-chart-dot-hitbox"
                cx={point.x}
                cy={point.y}
                r="14"
                onMouseEnter={() => setActivePointKey(`${point.shipmentId}-${point.dayOffset}`)}
                onMouseMove={() => setActivePointKey(`${point.shipmentId}-${point.dayOffset}`)}
              />
              <circle
                className="shipment-line-chart-dot"
                cx={point.x}
                cy={point.y}
                r="4"
              />
            </g>
          ))}
        </svg>
        {activePoint ? (
          <div
            className="shipment-line-chart-tooltip"
            style={{
              left: `${(activePoint.x / plotWidth) * 100}%`,
              top: `${activePoint.y}px`,
            }}
            onMouseEnter={() =>
              setActivePointKey(`${activePoint.shipmentId}-${activePoint.dayOffset}`)
            }
          >
            <button
              type="button"
              className="shipment-line-chart-link"
              onClick={() =>
                onSelectShipment(
                  activePoint.shipmentId,
                  activePoint.label,
                  activePoint.shipmentKind
                )
              }
            >
              {activePoint.label}
            </button>
            <span>{activePoint.shipmentDateLabel}</span>
            <span>{formatCurrency(activePoint.shipmentValue)} added</span>
            <span>{formatCurrency(activePoint.cumulativeValue)} running total</span>
          </div>
        ) : null}
        <div className="shipment-line-chart-x-axis">
          {MONTH_AXIS_LABELS.map((month) => <span key={month}>{month}</span>)}
        </div>
      </div>
    </div>
  );
}

export function ShipmentItemsLineChart({ points, xAxisEndLabel, onSelectShipment }) {
  const plotWidth = 560;
  const plotHeight = 240;
  const axisMax = shipmentItemsAxisMax(points.map((point) => point.cumulativeItems));
  const yTicks = Array.from({ length: 5 }, (_, index) => ((4 - index) / 4) * axisMax);
  const [activePointKey, setActivePointKey] = useState(null);
  const coordinates = points.map((point) => ({
    ...point,
    x: (point.dayOffset / point.totalDays) * plotWidth,
    y: plotHeight - (point.cumulativeItems / axisMax) * plotHeight,
  }));
  const activePoint =
    coordinates.find((point) => `${point.shipmentId}-${point.dayOffset}` === activePointKey) || null;
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <div className="shipment-line-chart">
      <div className="shipment-line-chart-y-axis">
        {yTicks.map((tick) => (
          <span key={tick}>{formatNumber(tick)}</span>
        ))}
      </div>
      <div className="shipment-line-chart-plot" onMouseLeave={() => setActivePointKey(null)}>
        <div className="shipment-line-chart-grid" aria-hidden="true">
          {yTicks.map((tick) => (
            <span key={`line-${tick}`} />
          ))}
        </div>
        <svg
          className="shipment-line-chart-svg"
          viewBox={`0 0 ${plotWidth} ${plotHeight}`}
          preserveAspectRatio="none"
          aria-label="Total items shipped this year line chart"
          role="img"
        >
          {coordinates.length > 1 ? (
            <path className="shipment-line-chart-path shipment-line-chart-path-secondary" d={linePath} />
          ) : null}
          {coordinates.map((point) => (
            <g key={`${point.shipmentId}-${point.dayOffset}`}>
              <circle
                className="shipment-line-chart-dot-hitbox"
                cx={point.x}
                cy={point.y}
                r="14"
                onMouseEnter={() => setActivePointKey(`${point.shipmentId}-${point.dayOffset}`)}
                onMouseMove={() => setActivePointKey(`${point.shipmentId}-${point.dayOffset}`)}
              />
              <circle
                className="shipment-line-chart-dot shipment-line-chart-dot-secondary"
                cx={point.x}
                cy={point.y}
                r="4"
              />
            </g>
          ))}
        </svg>
        {activePoint ? (
          <div
            className="shipment-line-chart-tooltip"
            style={{
              left: `${(activePoint.x / plotWidth) * 100}%`,
              top: `${activePoint.y}px`,
            }}
            onMouseEnter={() =>
              setActivePointKey(`${activePoint.shipmentId}-${activePoint.dayOffset}`)
            }
          >
            <button
              type="button"
              className="shipment-line-chart-link"
              onClick={() =>
                onSelectShipment(
                  activePoint.shipmentId,
                  activePoint.label,
                  activePoint.shipmentKind
                )
              }
            >
              {activePoint.label}
            </button>
            <span>{activePoint.shipmentDateLabel}</span>
            <span>{formatNumber(activePoint.shipmentItems)} items added</span>
            <span>{formatNumber(activePoint.cumulativeItems)} items running total</span>
          </div>
        ) : null}
        <div className="shipment-line-chart-x-axis">
          {MONTH_AXIS_LABELS.map((month) => <span key={month}>{month}</span>)}
        </div>
      </div>
    </div>
  );
}

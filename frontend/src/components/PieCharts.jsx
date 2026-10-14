import { useState } from "react";
import { buildPieChartBackground, buildPieChartSegments } from "../lib/charts.js";
import { formatNumber } from "../lib/format.js";

export function MetricCard({ label, value, className = "", valueClassName = "" }) {
  return (
    <div className={className ? `metric-card ${className}` : "metric-card"}>
      <p className="metric-label">{label}</p>
      <p className={valueClassName ? `metric-value ${valueClassName}` : "metric-value"}>{value}</p>
    </div>
  );
}

export function PieChartCard({
  title,
  ariaLabel,
  totalItems,
  segments,
  legendSegments = segments,
  background,
  activeLabel,
  onHover,
  cardClassName = "",
  centerLabel = "raw items",
  renderLegendDetail,
  onSegmentClick,
}) {
  const normalizedActiveLabel = (activeLabel || "").trim().toLowerCase();

  return (
    <div className={`expiry-chart-card compact ${cardClassName}`.trim()}>
      <h4>{title}</h4>
      <div className="expiration-pie-layout">
        <div className="expiration-pie-wrap">
          <div
            className="expiration-pie-chart"
            style={{ background }}
            aria-label={ariaLabel}
            role="img"
            onMouseLeave={() => onHover(null)}
          >
            <svg className="pie-slice-layer" viewBox="0 0 200 200" aria-hidden="true">
              {segments.map((segment) => (
                <path
                  key={segment.label}
                  d={segment.path}
                  className={
                    normalizedActiveLabel === segment.label.trim().toLowerCase()
                      ? "pie-slice-hotspot active"
                      : "pie-slice-hotspot"
                  }
                  onPointerEnter={() => onHover(segment.label)}
                  onPointerMove={() => onHover(segment.label)}
                />
              ))}
            </svg>
            <div className="expiration-pie-center">
              <strong>{formatNumber(totalItems)}</strong>
              <span>{centerLabel}</span>
            </div>
          </div>
        </div>

        <div className="expiration-pie-legend">
          {legendSegments.map((segment) => (
             <button
               type="button"
              className={
                normalizedActiveLabel === segment.label.trim().toLowerCase()
                  ? "expiration-pie-legend-row active"
                  : "expiration-pie-legend-row"
              }
              key={segment.label}
              onPointerEnter={() => onHover(segment.label)}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onHover(segment.label)}
               onBlur={() => onHover(null)}
               onClick={() => onSegmentClick?.(segment)}
               title={onSegmentClick ? `View ${segment.label} supplies in inventory` : undefined}
             >
                <span
                  className="expiration-pie-swatch"
                  style={{ backgroundColor: segment.color }}
                  aria-hidden="true"
                />
              <div className="expiration-pie-copy">
                <strong>{segment.label}</strong>
                <span>
                  {renderLegendDetail
                    ? renderLegendDetail(segment)
                    : `${formatNumber(segment.value)} items • ${segment.percentage}% of raw items`}
                </span>
                {normalizedActiveLabel === segment.label.trim().toLowerCase() ? (
                  <span className="expiration-pie-click-hint">
                    Click to view inventory
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CompactPalletPieChart({ title, ariaLabel, segments, tooltipFormatter }) {
  const [activeLabel, setActiveLabel] = useState(null);
  const pieSegments = buildPieChartSegments(segments.filter((segment) => segment.value > 0));
  const activeSegment =
    segments.find((segment) => segment.label === activeLabel) || null;

  return (
    <div className="pallet-mini-chart-card">
      <span className="pallet-mini-chart-title">{title}</span>
      <div
        className="pallet-mini-chart-wrap"
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setActiveLabel(null)}
      >
        <div
          className="pallet-mini-chart"
          style={{ background: buildPieChartBackground(segments.filter((segment) => segment.value > 0)) }}
        >
          <svg className="pie-slice-layer" viewBox="0 0 200 200" aria-hidden="true">
            {pieSegments.map((segment) => (
              <path
                key={segment.label}
                d={segment.path}
                className={activeLabel === segment.label ? "pie-slice-hotspot active" : "pie-slice-hotspot"}
                onPointerEnter={() => setActiveLabel(segment.label)}
                onPointerMove={() => setActiveLabel(segment.label)}
              />
            ))}
          </svg>
        </div>
        {activeSegment ? (
          <div className="pallet-mini-tooltip">
            {tooltipFormatter(activeSegment).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

import { BREAKDOWN_DIMS, BREAKDOWN_MEASURES } from "../lib/breakdown.js";
import { formatCurrency, formatNumber } from "../lib/format.js";

const CHARTS = [
  { id: "bars", label: "Bars" },
  { id: "ring", label: "Ring" },
];

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="breakdown-control" role="group" aria-label={label}>
      <span className="breakdown-control-label">{label}</span>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={value === option.id ? "segment active" : "segment"}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function BreakdownControls({ dim, measure, chart, onDim, onMeasure, onChart }) {
  return (
    <div className="breakdown-controls">
      <Segmented label="Break down by" options={BREAKDOWN_DIMS} value={dim} onChange={onDim} />
      <Segmented label="Measure" options={BREAKDOWN_MEASURES} value={measure} onChange={onMeasure} />
      <Segmented label="Chart" options={CHARTS} value={chart} onChange={onChart} />
    </div>
  );
}

export function formatMeasure(value, measure) {
  return measure === "value" ? formatCurrency(value) : formatNumber(value);
}

function percentLabel(percent) {
  return percent > 0 && percent < 1 ? "<1%" : `${Math.round(percent)}%`;
}

const RING_RADIUS = 40;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function Ring({ segments, total, measure, ariaLabel }) {
  let offset = 0;
  const gap = segments.length > 1 ? 1.2 : 0;
  return (
    <svg className="breakdown-ring" viewBox="0 0 100 100" role="img" aria-label={ariaLabel}>
      <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="var(--bp-surface-sunken)" strokeWidth="14" />
      {segments.map((segment) => {
        const length = (segment.value / total) * RING_LENGTH;
        const dash = Math.max(length - gap, 0.01);
        const circle = (
          <circle
            key={segment.id}
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            stroke={segment.color}
            strokeWidth="14"
            strokeDasharray={`${dash} ${RING_LENGTH - dash}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 50 50)"
          >
            <title>{`${segment.label}: ${formatMeasure(segment.value, measure)} (${percentLabel(segment.percent)})`}</title>
          </circle>
        );
        offset += length;
        return circle;
      })}
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="breakdown-ring-total">
        {measure === "value" ? formatCurrency(total) : formatNumber(total)}
      </text>
    </svg>
  );
}

// One reusable chart: a stacked share bar plus a horizontal bar per segment (or a ring
// with the same rows as its legend). Segments come from lib/breakdown.js buildBreakdown.
export default function Breakdown({ segments, total, measure, chart, onSelect, ariaLabel, emptyLabel = "Nothing to show." }) {
  if (segments.length === 0) {
    return <p className="breakdown-empty">{emptyLabel}</p>;
  }

  const max = Math.max(...segments.map((segment) => segment.value));

  return (
    <div className="breakdown">
      {chart === "ring" ? (
        <Ring segments={segments} total={total} measure={measure} ariaLabel={ariaLabel} />
      ) : (
        <div className="breakdown-stack" role="img" aria-label={ariaLabel}>
          {segments.map((segment) => (
            <button
              key={segment.id}
              type="button"
              className="breakdown-stack-segment"
              style={{ flexGrow: segment.value, background: segment.color }}
              title={`${segment.label}: ${formatMeasure(segment.value, measure)} (${percentLabel(segment.percent)})`}
              aria-label={`${segment.label}, ${percentLabel(segment.percent)}`}
              onClick={() => onSelect(segment)}
            />
          ))}
        </div>
      )}
      <ul className="breakdown-rows">
        {segments.map((segment) => (
          <li key={segment.id}>
            <button type="button" className="breakdown-row" onClick={() => onSelect(segment)}>
              <span className="legend-swatch" style={{ background: segment.color }} aria-hidden="true" />
              <span className="breakdown-label">{segment.label}</span>
              {chart === "bars" ? (
                <span className="breakdown-track" aria-hidden="true">
                  <span
                    className="breakdown-fill"
                    style={{ width: `${(segment.value / max) * 100}%`, background: segment.color }}
                  />
                </span>
              ) : (
                <span className="breakdown-track-spacer" />
              )}
              <span className="breakdown-value">{formatMeasure(segment.value, measure)}</span>
              <span className="breakdown-percent">{percentLabel(segment.percent)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

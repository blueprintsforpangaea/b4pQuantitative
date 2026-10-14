export function MetricCard({ label, value, className = "", valueClassName = "" }) {
  return (
    <div className={className ? `metric-card ${className}` : "metric-card"}>
      <p className="metric-label">{label}</p>
      <p className={valueClassName ? `metric-value ${valueClassName}` : "metric-value"}>{value}</p>
    </div>
  );
}

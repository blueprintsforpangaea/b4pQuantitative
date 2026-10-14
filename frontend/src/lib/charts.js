export function buildPieChartBackground(segments) {
  if (!segments.length) {
    return "conic-gradient(#dfe9f5 0deg 360deg)";
  }

  let currentAngle = 0;
  const stops = segments.map((segment) => {
    const start = currentAngle;
    const sweep = (segment.value / segment.total) * 360;
    currentAngle += sweep;
    return `${segment.color} ${start}deg ${currentAngle}deg`;
  });

  return `conic-gradient(${stops.join(", ")})`;
}

export function buildPieChartSegments(segments) {
  if (!segments.length) {
    return [];
  }

  const center = 100;
  const outerRadius = 100;
  const innerRadius = 72;

  function pointForAngle(angleInDegrees, radius) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(angleInRadians),
      y: center + radius * Math.sin(angleInRadians),
    };
  }

  function buildDonutSlicePath(startAngle, endAngle) {
    const outerStart = pointForAngle(startAngle, outerRadius);
    const outerEnd = pointForAngle(endAngle, outerRadius);
    const innerEnd = pointForAngle(endAngle, innerRadius);
    const innerStart = pointForAngle(startAngle, innerRadius);
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerEnd.x} ${innerEnd.y}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
      "Z",
    ].join(" ");
  }

  function buildFullDonutPath() {
    return [
      `M ${center} ${center - outerRadius}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${center - 0.01} ${center - outerRadius}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${center} ${center - outerRadius}`,
      `M ${center} ${center - innerRadius}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${center - 0.01} ${center - innerRadius}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${center} ${center - innerRadius}`,
      "Z",
    ].join(" ");
  }

  let currentAngle = 0;
  return segments.map((segment) => {
    const startAngle = currentAngle;
    const sweep = segment.total ? (segment.value / segment.total) * 360 : 0;
    const midAngle = currentAngle + sweep / 2;
    currentAngle += sweep;

    return {
      ...segment,
      startAngle,
      endAngle: currentAngle,
      midAngle,
      path:
        segments.length === 1 || Math.abs(sweep - 360) < 0.001
          ? buildFullDonutPath()
          : buildDonutSlicePath(startAngle, currentAngle),
    };
  });
}

export function shipmentChartAxisMax(values) {
  const highestValue = Math.max(...values, 0);
  return Math.max(5, Math.ceil(highestValue / 5) * 5);
}

export function shipmentValueAxisMax(values) {
  const highestValue = Math.max(...values, 0);
  return highestValue > 0 ? highestValue : 1;
}

export const MONTH_AXIS_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shipmentItemsAxisMax(values) {
  const highestValue = Math.max(...values, 0);
  return highestValue > 0 ? highestValue : 1;
}

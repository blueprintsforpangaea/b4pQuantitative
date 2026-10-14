import { STAGES, STAGE_LABELS, stageIndex } from "../lib/shipmentsLogic.js";

// Step tracker: Planned -> Pulling -> Consolidated -> Shipped -> Delivered.
export default function ShipmentTracker({ shipment }) {
  const current = stageIndex(shipment.stage);
  const dates = { shipped: shipment.ship_date, delivered: shipment.delivered_date };

  return (
    <ol className="ship-tracker" aria-label={`Shipment progress: ${STAGE_LABELS[shipment.stage]}`}>
      {STAGES.map((stage, index) => {
        const state = index < current ? "done" : index === current ? "current" : "todo";
        return (
          <li key={stage} className={`ship-step ship-step-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="ship-step-dot" aria-hidden="true">
              {state === "done" ? (
                <svg viewBox="0 0 12 12" width="10" height="10"><path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
              ) : null}
            </span>
            <span className="ship-step-label">{STAGE_LABELS[stage]}</span>
            {dates[stage] && index <= current ? <span className="ship-step-date">{dates[stage]}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

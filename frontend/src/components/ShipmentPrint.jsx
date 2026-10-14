import { createPortal } from "react-dom";
import { EXPIRY_LABELS, STAGE_LABELS, formatLocation, groupLinesByProduct, shipmentTotals, formatMoney } from "../lib/shipmentsLogic.js";

// Print-only report; screens hide it, @media print shows it alone. Use the browser's Save as PDF.
export default function ShipmentPrint({ shipment, today = new Date().toISOString().slice(0, 10) }) {
  if (!shipment) {
    return null;
  }
  const totals = shipmentTotals(shipment);
  const asOf = shipment.ship_date || today;
  const groups = groupLinesByProduct(shipment.lines || []);

  const details = [
    ["Shipment ID", shipment.id],
    ["Status", STAGE_LABELS[shipment.stage]],
    ["Recipient", shipment.recipient || shipment.name],
    ["Type", shipment.shipment_type],
    ["Shipping method", shipment.shipping_method || "Not set"],
    ["Blueprints contact", shipment.blueprints_contact || "Not set"],
    ["Ship date", shipment.ship_date || "Not set"],
    ["Delivered", shipment.delivered_date || "Not yet"],
    ["Request ID(s)", (shipment.request_ids || []).join(", ") || "None linked"],
  ];

  return createPortal(
    <section className="shipment-print" aria-hidden="true">
      <header>
        <p>Blueprints for Pangaea</p>
        <h1>Shipment report: {shipment.name}</h1>
      </header>
      <dl className="shipment-print-details">
        {details.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      {shipment.notes ? <p className="shipment-print-notes"><strong>Notes:</strong> {shipment.notes}</p> : null}
      <table>
        <thead>
          <tr><th>Item</th><th>Lot</th><th>Location</th><th>Expiry</th><th>Expiry status as of {asOf}</th><th>Qty</th><th>Value</th></tr>
        </thead>
        <tbody>
          {groups.flatMap((group) =>
            group.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.name}</td>
                <td>{line.lot_number || ""}</td>
                <td>{formatLocation(line)}</td>
                <td>{line.expiration_date || "None"}</td>
                <td>{EXPIRY_LABELS[line.expiry_status]}</td>
                <td>{line.quantity}</td>
                <td>{formatMoney((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr><td colSpan="5">{totals.line_count} lines</td><td>{totals.units}</td><td>{formatMoney(totals.value)}</td></tr>
        </tfoot>
      </table>
      <footer>Printed {today}</footer>
    </section>,
    document.body
  );
}

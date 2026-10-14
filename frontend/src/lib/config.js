export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export const SHIPMENT_STORAGE_KEY = "blueprints-current-shipments";

export const NON_INVENTORY_SHIPMENT_STORAGE_KEY = "blueprints-non-inventory-shipments";

export const PALLET_MAP_STORAGE_KEY = "blueprints-pallet-map-layout";

export const tabs = [
  { id: "inventory", label: "Total Inventory" },
  { id: "kpis", label: "Inventory KPIs" },
  { id: "stock-alerts", label: "Stock Alerts" },
  { id: "requests", label: "Requests" },
  { id: "shipments", label: "Shipments" },
  { id: "shipment-kpis", label: "Shipment KPIs" },
];

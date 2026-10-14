import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/base.css";
import "./styles/kpis.css";
import "./styles/shipment-kpis.css";
import "./styles/inventory.css";
import "./styles/shipments.css";
import "./styles/modals.css";
import "./styles/responsive.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

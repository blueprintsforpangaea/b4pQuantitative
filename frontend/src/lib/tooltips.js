export const BUTTON_TOOLTIPS = {
  "total inventory": "View the complete inventory",
  "inventory kpis": "View inventory metrics and charts",
  shipments: "Manage current and past shipments",
  "shipment kpis": "View shipment metrics and performance",
  filters: "Open inventory filters",
  "clear all": "Clear all inventory filters",
  "add selected to shipment": "Add selected supplies to a shipment",
  "current shipments": "View active inventory shipments",
  "non-inventory shipments": "View documented non-inventory shipments",
  "past shipments": "View shipped and delivered shipments",
  "create new shipment": "Create an inventory-based shipment",
  "create non-inventory shipment": "Document a non-inventory shipment",
  "show supplies": "Show supplies in this shipment",
  "hide supplies": "Hide supplies in this shipment",
  "add supplies via id": "Add supplies using supply IDs",
  "consolidate all": "Consolidate all supplies in this shipment",
  "unconsolidate all": "Unconsolidate all supplies in this shipment",
  "back all to inventory": "Return all shipment supplies to inventory",
  "mark as shipped": "Record shipment details and mark as shipped",
  consolidate: "Mark this supply as consolidated",
  unconsolidate: "Return this supply to unconsolidated status",
  "back to inventory": "Return this supply to inventory",
  "requested all units": "Change the requested quantity",
  "use add order filter": "Sort supplies by the order added",
  "use location filter": "Sort supplies by pallet location",
  "use expiration filter": "Sort supplies by expiration date",
  "view all 10 kpis": "View all KPIs",
  "view shipments": "Open current shipments",
  "shipment activity": "View shipment activity KPIs",
  "shipment flow time": "View shipment flow-time KPIs",
  "edit pallet conformation": "Edit the pallet layout configuration",
  "save conformation": "Save the updated pallet layout configuration",
  "same day": "Use the shipment date as the delivery date",
  tbd: "Set this value to TBD",
  "save shipped status": "Mark this shipment as shipped",
  "confirm delivered": "Confirm the shipment was delivered",
  "confirm shipped status": "Revert this shipment to shipped",
  "confirm return": "Confirm return to inventory",
  "confirm return all": "Confirm return of all supplies to inventory",
  "confirm request": "Save the requested quantity",
  "confirm consolidation": "Confirm consolidation of all supplies",
  "confirm unconsolidation": "Confirm unconsolidation of all supplies",
  "add supplies": "Add supplies to this shipment",
  "create shipment": "Create this shipment",
  "document shipment": "Save this non-inventory shipment",
  confirm: "Confirm supply consolidation",
};

export function normalizedControlText(element) {
  return String(element.textContent || "")
    .replace(/\s*\([\d,]+\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function modalControlTooltip(element, text) {
  const modal = element.closest('[role="dialog"]');
  if (!modal) return "";
  const heading = modal.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim();
  const subject = heading ? heading.toLowerCase() : "this window";
  if (element.classList.contains("modal-close") || text === "x" || text === "×") {
    return `Close ${subject}`;
  }
  if (text === "cancel") return `Cancel ${subject}`;
  return "";
}

export function controlTooltip(element) {
  const text = normalizedControlText(element);
  const modalTooltip = modalControlTooltip(element, text);
  if (modalTooltip) return modalTooltip;

  if (element.matches("button, [role='tab'], [role='button']")) {
    if (element.disabled) {
      if (text.startsWith("add selected to shipment")) {
        return "Select at least one available supply";
      }
      if (text === "consolidate all") return "No eligible supplies are available to consolidate";
      if (text === "back all to inventory") return "This shipment has no supplies to return";
      if (text === "mark as shipped") return "Consolidate all supplies before marking as shipped";
      if (text === "create shipment") return "Complete all required shipment details";
      if (text === "add supplies") return "Enter at least one supply ID";
    }
    if (BUTTON_TOOLTIPS[text]) return BUTTON_TOOLTIPS[text];
    if (text.startsWith("add selected to shipment")) {
      return "Add selected supplies to a shipment";
    }
    const ariaLabel = element.getAttribute("aria-label") || "";
    if (/^edit name for /i.test(ariaLabel)) return "Edit shipment name";
    if (/^edit shipment type for /i.test(ariaLabel)) return "Edit shipment type";
    if (/^edit point of contact for /i.test(ariaLabel)) {
      return "Edit Blueprints point of contact";
    }
    if (/^edit recipient point of contact for /i.test(ariaLabel)) {
      return "Edit recipient point of contact";
    }
    if (/^open details for supply /i.test(ariaLabel)) return "View supply details";
    if (/^open pallet details for /i.test(ariaLabel)) return ariaLabel.replace(/^Open/i, "View");
    return ariaLabel;
  }

  if (element.matches("select")) {
    const options = Array.from(element.options || []).map((option) => option.textContent.toLowerCase());
    if (options.some((option) => option.includes("shipment type"))) return "Filter by shipment type";
    if (options.some((option) => option.includes("status date"))) return "Sort by shipment milestone date";
    if (options.some((option) => option.includes("status:"))) return "Filter by shipment status";
    if (options.some((option) => option.includes("location:"))) return "Filter by shipment location";
    if (options.some((option) => option.includes("valuation:"))) return "Sort shipments by valuation";
    if (options.some((option) => option === "local") && options.some((option) => option === "international")) {
      return "Choose local or international shipment";
    }
    if (options.some((option) => option === "planning") && options.some((option) => option === "delivered")) {
      return "Change the shipment status";
    }
    if (element.closest(".shipment-modal")) return "Choose an option";
  }

  if (element.matches("input, textarea")) {
    const placeholder = (element.getAttribute("placeholder") || "").toLowerCase();
    const ariaLabel = element.getAttribute("aria-label") || "";
    if (ariaLabel) {
      if (/select all filtered inventory/i.test(ariaLabel)) return "Select all available supplies";
      if (/^select supply /i.test(ariaLabel)) return "Select this supply";
      return ariaLabel;
    }
    if (placeholder.includes("search by general supply")) return "Search inventory supplies";
    if (placeholder.includes("search shipments")) return "Search shipments";
    if (placeholder.includes("search shipment or clinic")) return "Search non-inventory shipments";
    if (placeholder.includes("recipient name")) return "Enter the receiving clinic or organization";
    if (placeholder.includes("recipient point of contact")) {
      return "Enter the recipient point of contact or select TBD";
    }
    if (placeholder.includes("point of contact")) return "Select a Blueprints point of contact";
    if (placeholder.includes("supply ids")) return "Enter supply IDs to add";
    if (placeholder.includes("shipment notes")) return "Add or update shipment notes";
    if (placeholder.includes("delivery notes")) return "Add or update delivery notes";
    if (placeholder.includes("clinic")) return "Enter the receiving organization";
    if (element.type === "range") return "Filter supplies by unit price";
    if (element.type === "date") {
      return element.closest('[aria-labelledby="delivered-modal-title"]')
        ? "Set the actual delivery date"
        : "Set the shipment date";
    }
    if (element.type === "checkbox") {
      const optionLabel = element.closest("label");
      const optionValue = optionLabel?.querySelector("span")?.textContent?.trim();
      const groupName = element.closest(".filter-group")?.querySelector("h4")?.textContent?.trim();
      if (groupName && optionValue) return `Filter ${groupName} by ${optionValue}`;
      return optionValue ? `Select ${optionValue}` : "Select this option";
    }
    if (element.type === "number") return "Enter the requested quantity";
  }

  return element.getAttribute("aria-label") || "";
}

export function applyDashboardTooltips(root = document) {
  root
    .querySelectorAll("button, input, select, textarea, [role='tab'], [role='button']")
    .forEach((element) => {
      const tooltip = controlTooltip(element);
      if (tooltip) element.setAttribute("title", tooltip);
    });
}

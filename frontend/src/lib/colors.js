// Expiry urgency is a single-hue ramp stepped by lightness, not a
// red-amber-yellow rainbow: two adjacent warm hues collapse into each other
// under red-green colour blindness, whereas a lightness order survives it.
// Validated as an ordinal ramp (monotone L, gaps >= 0.06, light end >= 2:1).
// "365+ days" and "No expiration" sit outside the ramp as reserved states.
export const expirationBucketColors = {
  "Already expired": "#5E140C",
  "Already Expired": "#5E140C",
  "0-90 days": "#A32B10",
  "90-180 days": "#D35F2A",
  "180-365 days": "#D98038",
  "365+ days": "#1E7A43",
  "No expiration": "#7D7D7D",
  "No expiration date": "#7D7D7D",
};

// Warehouse duration is a magnitude, so it gets one hue light-to-dark --
// the brand azure running down into the logo's navy. Validated ordinal.
export const durationBucketColors = {
  "0-30 days": "#93B5E4",
  "31-90 days": "#5C87CE",
  "91-180 days": "#2E5CB4",
  "181-365 days": "#0337A3",
  "365+ days": "#02245F",
  "Unknown duration": "#E2E2E2",
};

export const durationBucketOrder = [
  "0-30 days",
  "31-90 days",
  "91-180 days",
  "181-365 days",
  "365+ days",
];

// Supply category is identity, not magnitude, so it needs distinct hues rather
// than the twelve shades of blue this used to be (four of which were
// indistinguishable even with full colour vision). Fixed order, led by the
// brand azure, never cycled. Every slice also carries its name in the legend,
// which is what keeps identity off colour alone.
export const categoryPiePalette = [
  "#116DFF",
  "#B87F00",
  "#1E4FC4",
  "#4E9A00",
  "#5B57D8",
  "#6F8A00",
  "#8E4EC6",
  "#E4670A",
  "#A03C9E",
  "#9A7A00",
  "#2E6FB8",
  "#2F8F2F",
];

// Anything past the fixed order is not given a new hue -- it goes neutral.
export const categoryOverflowColor = "#7D7D7D";

// The fixed order mirrors the backend's approved category list, so a category
// keeps the same hue no matter what is filtered out, shipped, or missing from
// the sheet. Colour follows the category, never its rank in the current chart.
export const categoryColorOrder = [
  "Airway & Oxygen",
  "Apparel (Gowns, Shoe Covers, etc.)",
  "Catheters & Briefs",
  "Gloves",
  "IV Supplies",
  "Masks & Face Shields",
  "Misc Non-Medical",
  "Misc Surgical",
  "Needles & Syringes",
  "Sutures",
  "Vitals & Home Health",
  "Wound Care & Bandages",
];

export function colorForCategory(categoryName) {
  const index = categoryColorOrder.indexOf(categoryName);
  return index >= 0 ? categoryPiePalette[index] : categoryOverflowColor;
}

export function colorForBoxType(index) {
  return index < boxCategoryPalette.length
    ? boxCategoryPalette[index]
    : categoryOverflowColor;
}

export const valueBucketOrder = ["$0-$50", "$50-$100", "$100-$200", "$200+"];

// Price bands are a magnitude: one hue, light to dark. Validated ordinal.
export const valueBucketColors = {
  "$0-$50": "#B4B4B4",
  "$50-$100": "#8A8A8A",
  "$100-$200": "#5E5E5E",
  "$200+": "#333333",
};

export const supplyStatusOrder = ["Inventory", "Pulled", "Consolidated"];

// The workflow is a progression, so it reads as one hue darkening as a supply
// moves from shelf to shipment. Validated ordinal.
export const supplyStatusColors = {
  Inventory: "#7FA9F5",
  Pulled: "#116DFF",
  Consolidated: "#0337A3",
};

// Box categories are identity too; take the first six of the fixed order so a
// box type keeps the same hue it has in the category chart.
export const boxCategoryPalette = [
  "#116DFF",
  "#B87F00",
  "#1E4FC4",
  "#4E9A00",
  "#5B57D8",
  "#6F8A00",
];

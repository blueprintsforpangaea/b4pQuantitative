"""CSV exports. Built from the redacted dash_* views only (names are already free of patient identifiers)."""
import csv
import io
from typing import Any, Dict, List

MAX_MATCHES_PER_LINE = 5


def _cell(value: Any) -> Any:
    """Neutralise spreadsheet formulas in text that came from outside (names, org names)."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def to_csv(header: List[str], rows: List[List[Any]]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(header)
    for row in rows:
        w.writerow([_cell(c) for c in row])
    return buf.getvalue()


def expiring_csv(alerts: Dict[str, Any]) -> str:
    rows = [
        ["Expired" if r["days_left"] <= 0 else "Expiring soon", r["id"], r["name"], r["category"], r["quantity"],
         r["expiration_date"], r["days_left"], r["pallet_number"], r["category_box"], r["box_number"]]
        for r in alerts["expired"] + alerts["expiring_soon"]
    ]
    return to_csv(["Status", "Supply ID", "Name", "Category", "Quantity", "Expiration date", "Days left",
                   "Pallet", "Box category", "Box number"], rows)


def packing_list_csv(request: Dict[str, Any], items: List[Any]) -> str:
    """One row per (requested line, matching inventory row), earliest expiration first.

    Requested names are free text, so a line is matched to inventory by exact name (case-insensitive).
    Lines with no match in stock still get a row, marked 'Not found in stock'.
    """
    by_name: Dict[str, List[Any]] = {}
    for i in items:
        if i.quantity > 0:
            by_name.setdefault(i.name.strip().lower(), []).append(i)
    rows = []
    for line in request["items"]:
        matches = sorted(by_name.get(line["item_name"].strip().lower(), []), key=lambda i: (i.expiration_date or "9999-12-31", i.id))
        if not matches:
            rows.append([request["request_id"], request["org_name"], line["item_name"], line["quantity"], "Not found in stock", "", "", "", "", "", ""])
        for m in matches[:MAX_MATCHES_PER_LINE]:
            rows.append([request["request_id"], request["org_name"], line["item_name"], line["quantity"], "In stock", m.id,
                         m.quantity, m.pallet_number, m.category_box, m.box_number, m.expiration_date or ""])
    return to_csv(["Request", "Organization", "Requested item", "Quantity requested", "Match", "Supply ID",
                   "On hand", "Pallet", "Box category", "Box number", "Expiration date"], rows)

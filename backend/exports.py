"""CSV exports. Built from the redacted dash_* views only (names are already free of patient identifiers)."""
import csv
import io
import re
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


_SUFFIX = re.compile(r"\s*\[([^\]]*)\]\s*$")


def _norm(name: str) -> str:
    return " ".join(name.casefold().split())


def parse_requested_name(raw: str) -> Dict[str, Any]:
    """Split 'Name [Lot L9, Box 1, Pallet 2]' (what the external site submits) into name, lot, box, pallet."""
    m = _SUFFIX.search(raw or "")
    out: Dict[str, Any] = {"name": raw or "", "lot": "", "box": None, "pallet": None}
    if not m:
        return out
    out["name"] = raw[: m.start()].strip()
    for part in m.group(1).split(","):
        key, _, value = part.strip().partition(" ")
        key, value = key.casefold(), value.strip()
        if key == "lot":
            out["lot"] = value
        elif key in ("box", "pallet") and value.isdigit():
            out[key] = int(value)
    return out


def packing_list_csv(request: Dict[str, Any], items: List[Any]) -> str:
    """One row per (requested line, matching inventory row).

    Requested names are free text and often carry a ' [Lot X, Box Y, Pallet Z]' suffix, so a line is
    matched to inventory by name with the suffix removed, ignoring case and extra whitespace. Rows in
    the requested box and pallet come first (inventory has no lot number, so the lot is only echoed
    back for the packer), then the earliest expiration. Lines with no match in stock still get a row.
    """
    by_name: Dict[str, List[Any]] = {}
    for i in items:
        if i.quantity > 0:
            by_name.setdefault(_norm(i.name), []).append(i)
    rows = []
    for line in request["items"]:
        want = parse_requested_name(line["item_name"])
        extra = [want["lot"], want["box"] if want["box"] is not None else "", want["pallet"] if want["pallet"] is not None else ""]

        def exact(i):
            return (want["box"] is None or i.box_number == want["box"]) and (want["pallet"] is None or i.pallet_number == want["pallet"]) \
                and (want["box"] is not None or want["pallet"] is not None)

        matches = sorted(by_name.get(_norm(want["name"]), []), key=lambda i: (not exact(i), i.expiration_date or "9999-12-31", i.id))
        if not matches:
            rows.append([request["request_id"], request["org_name"], line["item_name"], line["quantity"], "Not found in stock", "", "", "", "", "", "", *extra, ""])
        for m in matches[:MAX_MATCHES_PER_LINE]:
            rows.append([request["request_id"], request["org_name"], line["item_name"], line["quantity"], "In stock", m.id,
                         m.quantity, m.pallet_number, m.category_box, m.box_number, m.expiration_date or "", *extra,
                         "Yes" if exact(m) else "No"])
    return to_csv(["Request", "Organization", "Requested item", "Quantity requested", "Match", "Supply ID",
                   "On hand", "Pallet", "Box category", "Box number", "Expiration date",
                   "Requested lot", "Requested box", "Requested pallet", "In requested box and pallet"], rows)

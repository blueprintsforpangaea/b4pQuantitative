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


# Only the partner site's "[Lot ..., Box ..., Pallet ...]" suffix; other brackets are part of the name ("Tape [Pack of 12]").
_SUFFIX = re.compile(r"\s*\[(Lot\b[^\]]*)\]\s*$", re.IGNORECASE)


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
    matched to inventory by name with the suffix removed, ignoring case and extra whitespace. Rows that
    match the most of the requested lot, box and pallet come first, then the earliest expiration. Lines with no match in stock still get a row.
    """
    by_name: Dict[str, List[Any]] = {}
    for i in items:
        if i.quantity > 0:
            by_name.setdefault(_norm(i.name), []).append(i)
    rows = []
    for line in request["items"]:
        want = parse_requested_name(line["item_name"])
        extra = [want["lot"], want["box"] if want["box"] is not None else "", want["pallet"] if want["pallet"] is not None else ""]

        def score(i):
            """How many of the requested lot / box / pallet this inventory row matches (lot compared casefolded)."""
            return ((bool(want["lot"]) and (getattr(i, "lot_number", None) or "").casefold() == want["lot"].casefold())
                    + (want["box"] is not None and i.box_number == want["box"])
                    + (want["pallet"] is not None and i.pallet_number == want["pallet"]))

        asked = (bool(want["lot"]), want["box"] is not None, want["pallet"] is not None)

        def exact(i):
            return any(asked) and score(i) == sum(asked)

        matches = sorted(by_name.get(_norm(want["name"]), []), key=lambda i: (-score(i), i.expiration_date or "9999-12-31", i.id))
        if not matches:
            rows.append([request["request_id"], request["org_name"], line["item_name"], line["quantity"], "Not found in stock", "", "", "", "", "", "", *extra, "", ""])
        for m in matches[:MAX_MATCHES_PER_LINE]:
            rows.append([request["request_id"], request["org_name"], line["item_name"], line["quantity"], "In stock", m.id,
                         m.quantity, m.pallet_number, m.category_box, m.box_number, m.expiration_date or "", *extra,
                         "Yes" if exact(m) else "No", getattr(m, "lot_number", None) or ""])
    return to_csv(["Request", "Organization", "Requested item", "Quantity requested", "Match", "Supply ID",
                   "On hand", "Pallet", "Box category", "Box number", "Expiration date",
                   "Requested lot", "Requested box", "Requested pallet", "In requested lot, box and pallet", "Lot"], rows)


def add_stock_warnings(requests: List[Dict[str, Any]], items: List[Any]) -> None:
    """Add request['warnings'] and request['unmatched'] to open requests (Under Review / Approved). Display only.

    For each line: committed = quantity of that item already approved on *other* requests + this line.
    If committed exceeds what is in stock (names matched as in the packing list) the line is listed.
    """
    stock: Dict[str, int] = {}
    known = {_norm(i.name) for i in items}  # an item that exists but has 0 on hand is a real shortage
    for i in items:
        stock[_norm(i.name)] = stock.get(_norm(i.name), 0) + max(i.quantity, 0)
    key = lambda raw: _norm(parse_requested_name(raw)["name"])
    approved: Dict[str, int] = {}
    for r in requests:
        if r["status"] == "Approved":
            for line in r["items"]:
                approved[key(line["item_name"])] = approved.get(key(line["item_name"]), 0) + line["quantity"]
    for r in requests:
        warnings, unmatched = [], []
        if r["status"] in ("Under Review", "Approved"):
            this: Dict[str, int] = {}
            for line in r["items"]:
                this[key(line["item_name"])] = this.get(key(line["item_name"]), 0) + line["quantity"]
            for k, qty in this.items():
                if k not in known:
                    unmatched.append(next(parse_requested_name(l["item_name"])["name"] for l in r["items"] if key(l["item_name"]) == k))
                    continue
                others = approved.get(k, 0) - (qty if r["status"] == "Approved" else 0)
                committed, in_stock = others + qty, stock.get(k, 0)
                if committed > in_stock:
                    name = next(l["item_name"] for l in r["items"] if key(l["item_name"]) == k)
                    warnings.append({"item_name": parse_requested_name(name)["name"], "committed": committed, "in_stock": in_stock})
        r["warnings"] = warnings
        r["unmatched"] = unmatched  # lines whose name matches no inventory item (neutral note, not a shortage)

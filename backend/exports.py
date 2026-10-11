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


_STOPWORDS = {"and", "with", "for", "the", "per", "from", "that", "this", "into", "are"}


def significant_tokens(name: str) -> frozenset:
    """Lowercase words of a name without punctuation, stopwords and short bits ('21 G' becomes '21g')."""
    text = re.sub(r"[^a-z0-9]+", " ", name.casefold())
    text = re.sub(r"(\d) (?=[a-z]\b)", r"\1", text)
    return frozenset(t for t in text.split() if len(t) >= 3 and t not in _STOPWORDS)


def find_match(requested: str, products: Dict[str, frozenset]):
    """Resolve a requested name to inventory product names (keys of `products` are _norm names).

    ("exact", [key])        same name ignoring case and spacing
    ("approximate", [key])  every significant word of the request is in exactly one best-scoring name
    ("candidates", [keys])  several names tie for best score: do not pick one
    ("none", [])
    Score is request words / inventory-name words, so the closest (shortest) containing name wins.
    """
    key = _norm(requested)
    if key in products:
        return "exact", [key]
    want = significant_tokens(requested)
    if not want:
        return "none", []
    scored = [(len(want) / len(tokens), k) for k, tokens in products.items() if want <= tokens]
    if not scored:
        return "none", []
    best = max(score for score, _ in scored)
    top = sorted(k for score, k in scored if score == best)
    return ("approximate", top) if len(top) == 1 else ("candidates", top)


def _products(items: List[Any]) -> Dict[str, frozenset]:
    return {k: significant_tokens(k) for k in {_norm(i.name) for i in items}}


def packing_list_csv(request: Dict[str, Any], items: List[Any]) -> str:
    """One row per (requested line, matching inventory row).

    A line that carries the item id the requester picked uses exactly that inventory row ("In stock
    (requested item)", "None on hand" or "No longer in stock") and no name matching. Otherwise requested
    names are free text and often carry a ' [Lot X, Box Y, Pallet Z]' suffix. A line is matched
    to in-stock inventory by exact name (suffix removed, case and spacing ignored); failing that by
    significant words ("Approximate match"), and when several different names tie every one is listed
    as a candidate. Within a name, rows matching the most of the requested lot, box and pallet come
    first, then the earliest expiration. Lines with no match still get a row.
    """
    by_name: Dict[str, List[Any]] = {}
    for i in items:
        if i.quantity > 0:
            by_name.setdefault(_norm(i.name), []).append(i)
    products = {k: significant_tokens(k) for k in by_name}
    by_id = {i.id: i for i in items}
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

        ref = line.get("item_id") or ""
        if ref:  # the requester picked an exact inventory row: no name matching
            picked = by_id.get(ref)
            kind = "id" if picked is not None and picked.quantity > 0 else ("out" if picked is not None else "gone")
            keys = []
            matches = [picked] if kind == "id" else []
        else:
            kind, keys = find_match(want["name"], products)
            ranked = lambda k: sorted(by_name[k], key=lambda i: (-score(i), i.expiration_date or "9999-12-31", i.id))
            # exact/approximate: several rows of the one product; candidates: the best row of each tied product
            matches = ranked(keys[0])[:MAX_MATCHES_PER_LINE] if kind in ("exact", "approximate") else [ranked(k)[0] for k in keys[:MAX_MATCHES_PER_LINE]]
        label = {"id": "In stock (requested item)", "exact": "In stock", "approximate": "Approximate match", "candidates": "Approximate match - candidate"}.get(kind)
        if not matches:
            missing = {"out": "None on hand", "gone": "No longer in stock"}.get(kind, "Not found in stock")
            rows.append([request["request_id"], request["org_name"], line["item_name"], line["quantity"], missing, ref, "", "", "", "", "", *extra, "", "", picked.name if ref and picked else ""])
        for m in matches:
            rows.append([request["request_id"], request["org_name"], line["item_name"], line["quantity"], label, m.id,
                         m.quantity, m.pallet_number, m.category_box, m.box_number, m.expiration_date or "", *extra,
                         "Yes" if exact(m) else "No", getattr(m, "lot_number", None) or "", m.name])
    return to_csv(["Request", "Organization", "Requested item", "Quantity requested", "Match", "Supply ID",
                   "On hand", "Pallet", "Box category", "Box number", "Expiration date",
                   "Requested lot", "Requested box", "Requested pallet", "In requested lot, box and pallet", "Lot",
                   "Inventory name"], rows)


def add_stock_warnings(requests: List[Dict[str, Any]], items: List[Any]) -> None:
    """Add request['warnings'], ['unmatched'] and ['candidates'] to open requests (Under Review / Approved). Display only.

    Each line is resolved to an inventory product as in the packing list. For a resolved line,
    committed = quantity of that product already approved on *other* requests + this request's lines for it;
    if committed exceeds the stock total the line is listed in warnings (with match "exact" or
    "approximate"). A name matching no product is listed in unmatched; one matching several equally
    close products is listed in candidates (no shortage is claimed for it).
    """
    products = _products(items)
    by_id = {i.id: i for i in items}
    stock: Dict[str, int] = {}
    shown: Dict[str, str] = {}
    for i in items:
        k = _norm(i.name)
        stock[k] = stock.get(k, 0) + max(i.quantity, 0)
        shown.setdefault(k, i.name)
    resolved: Dict[str, Any] = {}

    def resolve(line):
        """("id"|exact|approximate|candidates|none|gone, keys): an item id the requester picked beats any name matching."""
        raw, ref = line["item_name"], line.get("item_id") or ""
        if ref:
            picked = by_id.get(ref)
            return ("id", [_norm(picked.name)]) if picked is not None else ("gone", [])
        if raw not in resolved:
            resolved[raw] = find_match(parse_requested_name(raw)["name"], products)
        return resolved[raw]

    approved: Dict[str, int] = {}
    for r in requests:
        if r["status"] == "Approved":
            for line in r["items"]:
                kind, keys = resolve(line)
                if kind in ("id", "exact", "approximate"):
                    approved[keys[0]] = approved.get(keys[0], 0) + line["quantity"]
    for r in requests:
        warnings, unmatched, candidates, removed = [], [], [], []
        if r["status"] in ("Under Review", "Approved"):
            this: Dict[str, int] = {}
            kinds: Dict[str, str] = {}
            for line in r["items"]:
                kind, keys = resolve(line)
                name = parse_requested_name(line["item_name"])["name"]
                if kind == "gone":
                    removed.append(name)
                elif kind == "none":
                    unmatched.append(name)
                elif kind == "candidates":
                    candidates.append({"item_name": name, "names": [shown[k] for k in keys[:5]]})
                else:
                    this[keys[0]] = this.get(keys[0], 0) + line["quantity"]
                    this_kind = "exact" if kind in ("exact", "id") else "approximate"
                    kinds[keys[0]] = "exact" if kinds.get(keys[0], this_kind) == "exact" and this_kind == "exact" else "approximate"
            for k, qty in this.items():
                others = approved.get(k, 0) - (qty if r["status"] == "Approved" else 0)
                committed, in_stock = others + qty, stock.get(k, 0)
                if committed > in_stock:
                    warnings.append({"item_name": shown[k], "committed": committed, "in_stock": in_stock, "match": kinds[k]})
        r["warnings"], r["unmatched"], r["candidates"], r["removed"] = warnings, unmatched, candidates, removed

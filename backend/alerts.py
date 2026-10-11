"""Expired / expiring-soon / low-stock classification of inventory items."""
from datetime import date
from typing import Any, Dict, List, Optional


def _days_left(expiration_date: Optional[str], today: date) -> Optional[int]:
    if not expiration_date:
        return None
    return (date.fromisoformat(expiration_date) - today).days


def build_alerts(items: List[Any], soon_days: int = 90, low_stock: int = 3, today: Optional[date] = None) -> Dict[str, Any]:
    """Group items with stock into expired (days_left <= 0), expiring within soon_days, and low stock (0 < qty <= low_stock, or 0).

    An item may appear in more than one group (e.g. expiring and low stock). Rows are
    sorted most urgent first and carry days_left (None when there is no expiration date).
    """
    today = today or date.today()
    expired, soon, low = [], [], []
    for i in items:
        left = _days_left(i.expiration_date, today)
        row = {
            "id": i.id, "name": i.name, "category": i.category, "quantity": i.quantity,
            "expiration_date": i.expiration_date, "days_left": left, "total_value": i.total_value,
            "pallet_number": i.pallet_number, "category_box": i.category_box, "box_number": i.box_number,
        }
        row["unit_value"] = i.unit_value
        # Nothing on hand means nothing to act on (same rule as v_expiring).
        if i.quantity > 0 and left is not None and left <= 0:
            expired.append(row)
        elif i.quantity > 0 and left is not None and left <= soon_days:
            soon.append(row)
        if i.quantity <= low_stock:
            low.append(row)
    by_days = lambda r: (r["days_left"], r["name"].lower())
    expired.sort(key=by_days)
    soon.sort(key=by_days)
    low.sort(key=lambda r: (r["quantity"], r["name"].lower()))
    summary = lambda rows: {"entries": len(rows), "priced": sum(1 for r in rows if r["unit_value"]), "units": sum(r["quantity"] for r in rows), "value": round(sum(r["total_value"] for r in rows), 2)}
    return {
        "soon_days": soon_days, "low_stock": low_stock,
        "summary": {"expired": summary(expired), "expiring_soon": summary(soon), "low_stock": summary(low)},
        "expired": expired, "expiring_soon": soon, "low_stock_items": low,
    }

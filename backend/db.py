"""Optional Postgres data source. Active only when DATABASE_URL is set."""
import os
from typing import Any, Dict, List, Optional

import psycopg
from psycopg.rows import dict_row

Error = psycopg.Error
NoDataFound = psycopg.errors.NoDataFound  # set_item_quantity: unknown or removed item
OperationalError = psycopg.OperationalError  # connection-level failures  # what callers catch for 'database unavailable'


def enabled() -> bool:
    return bool(os.getenv("DATABASE_URL"))


def _connect():
    # Short-lived connection per request (serverless). prepare_threshold=None
    # keeps this compatible with Supabase's pgbouncer pooler.
    return psycopg.connect(
        os.environ["DATABASE_URL"],
        connect_timeout=5,
        prepare_threshold=None,
        row_factory=dict_row,
    )


def fetch_items() -> List[Dict[str, Any]]:
    """Rows of dash_items, including sheet_row (callers may ignore it)."""
    with _connect() as conn:
        return conn.execute("SELECT * FROM dash_items").fetchall()


def set_quantity(item_id: str, quantity: int) -> Optional[Dict[str, Any]]:
    """Call set_item_quantity(); returns {id, quantity, total_value, sheet_row, name, image_url} or None if no such item."""
    with _connect() as conn:
        row = conn.execute("SELECT * FROM set_item_quantity(%s, %s)", (item_id, quantity)).fetchone()
        if row:
            # look up by the id the function returned (callers may pass ' 5 ' or '05')
            row.update(conn.execute("SELECT name, image_url FROM dash_items WHERE id = %s", (row["id"],)).fetchone())
        return row


def ping() -> None:
    with _connect() as conn:
        conn.execute("SELECT 1")


def fetch_request_lines() -> List[Dict[str, Any]]:
    """Rows of dash_requests (one per request line)."""
    with _connect() as conn:
        return conn.execute("SELECT * FROM dash_requests").fetchall()


def set_request_status(request_id: str, status: str):
    """set_request_status(): (found, stored status). found is False if the request does not exist.

    Raises db.Error for bad/forbidden changes. The status is read back so aliases ('pending',
    'approved') come back in their canonical form.
    """
    with _connect() as conn:
        found = conn.execute("SELECT set_request_status(%s, %s) AS ok", (request_id, status)).fetchone()["ok"]
        if not found:
            return False, None
        row = conn.execute('SELECT "Status" FROM dash_requests WHERE "Request ID" = %s LIMIT 1', (request_id,)).fetchone()
        return True, row["Status"] if row else status


def fetch_sync_status() -> Dict[str, Any]:
    """The single row of dash_sync_status."""
    with _connect() as conn:
        return conn.execute("SELECT * FROM dash_sync_status").fetchone()


# ==============================
# OPS SHIPMENTS (Blueprints_DB docs/CONTRACT.md, "Ops shipments")
# ==============================
CheckViolation = psycopg.errors.CheckViolation  # allocation over what is available -> 409
ACTIVE_STAGES = ("planned", "pulling", "consolidated")
PAST_STAGES = ("shipped", "delivered")


def _line_json(row: Dict[str, Any]) -> Dict[str, Any]:
    return dict(row)


def _with_lines(conn, heads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ids = [h["id"] for h in heads]
    by_ship: Dict[str, List[Dict[str, Any]]] = {i: [] for i in ids}
    if ids:
        for line in conn.execute("SELECT * FROM dash_shipment_lines WHERE shipment_id = ANY(%s)", (ids,)).fetchall():
            by_ship[line["shipment_id"]].append(_line_json(line))
    out = []
    for head in heads:
        lines = by_ship[head["id"]]
        units = sum(l["quantity"] for l in lines) if lines else (head["unit_count"] or 0)
        value = sum(l["quantity"] * (l["unit_price"] or 0) for l in lines) if lines else (head["value"] or 0)
        out.append({**head, "lines": lines,
                    "totals": {"line_count": len(lines), "units": units, "value": round(float(value), 2)}})
    return out


def fetch_shipments(scope: str = "all", shipment_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Shipments (dash_shipments + their dash_shipment_lines). Active first-created last; past newest first."""
    stages = {"active": ACTIVE_STAGES, "past": PAST_STAGES}.get(scope)
    with _connect() as conn:
        if shipment_id is not None:
            heads = conn.execute("SELECT * FROM dash_shipments WHERE id = %s", (shipment_id,)).fetchall()
        elif stages:
            heads = conn.execute("SELECT * FROM dash_shipments WHERE stage = ANY(%s)", (list(stages),)).fetchall()
        else:
            heads = conn.execute("SELECT * FROM dash_shipments").fetchall()
        shipments = _with_lines(conn, heads)
    if scope == "past":
        shipments.sort(key=lambda s: (s["ship_date"] or s["created_at"][:10], s["created_at"]), reverse=True)
    return shipments


def fetch_allocations() -> List[Dict[str, Any]]:
    with _connect() as conn:
        return conn.execute("SELECT * FROM dash_allocations").fetchall()


def create_shipment(header: Dict[str, Any], lines: List[Dict[str, Any]]) -> str:
    from psycopg.types.json import Jsonb
    with _connect() as conn:
        return conn.execute("SELECT create_shipment(NULL, %s, %s) AS id", (Jsonb(header), Jsonb(lines))).fetchone()["id"]


def update_shipment(shipment_id: str, patch: Dict[str, Any]) -> bool:
    from psycopg.types.json import Jsonb
    with _connect() as conn:
        return conn.execute("SELECT update_shipment(%s, %s) AS ok", (shipment_id, Jsonb(patch))).fetchone()["ok"]


def set_shipment_lines(shipment_id: str, lines: List[Dict[str, Any]]) -> None:
    from psycopg.types.json import Jsonb
    with _connect() as conn:
        conn.execute("SELECT set_shipment_lines(%s, %s)", (shipment_id, Jsonb(lines)))


def set_line_flags(shipment_id: str, line_id: int, picked: Optional[bool], consolidated: Optional[bool]) -> bool:
    """False if the line does not exist or belongs to another shipment."""
    with _connect() as conn:
        owner = conn.execute("SELECT shipment_id FROM dash_shipment_lines WHERE id = %s", (str(line_id),)).fetchone()
        if not owner or owner["shipment_id"] != shipment_id:
            return False
        return conn.execute("SELECT set_shipment_line_flags(%s, %s, %s) AS ok", (line_id, picked, consolidated)).fetchone()["ok"]


def import_shipments(plans: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Create each planned shipment ({id, header, lines}) in its own savepoint.

    Returns {created, skipped, errors: [{id, reason}]}. A shipment whose id already exists is skipped.
    Lines naming an item that is not in dash_items are turned into free-text lines first.
    """
    from psycopg.types.json import Jsonb
    created = skipped = 0
    errors: List[Dict[str, Any]] = []
    with _connect() as conn:
        known = {r["id"] for r in conn.execute("SELECT id FROM dash_items").fetchall()}
        for plan in plans:
            sid = plan["id"]
            try:
                with conn.transaction():
                    if conn.execute("SELECT 1 FROM dash_shipment WHERE id = %s", (sid,)).fetchone():
                        skipped += 1
                        continue
                    lines = []
                    for line in plan["lines"]:
                        if line.get("item_id") is not None and str(line["item_id"]).strip() in known:
                            lines.append({**line, "item_id": str(line["item_id"]).strip()})
                        else:
                            lines.append({k: v for k, v in line.items() if k != "item_id"})
                    conn.execute("SELECT create_shipment(%s, %s, %s, true)", (sid, Jsonb(plan["header"]), Jsonb(lines)))
                    created += 1
            except psycopg.errors.DataError as exc:
                errors.append({"id": sid, "reason": exc.diag.message_primary or "invalid data"})
            except (psycopg.errors.RaiseException, psycopg.errors.CheckViolation, psycopg.errors.NoDataFound) as exc:
                errors.append({"id": sid, "reason": exc.diag.message_primary or "rejected"})
    return {"created": created, "skipped": skipped, "errors": errors}

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

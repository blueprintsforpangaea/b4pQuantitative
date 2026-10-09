"""Optional Postgres data source. Active only when DATABASE_URL is set."""
import os
from typing import Any, Dict, List, Optional

import psycopg
from psycopg.rows import dict_row

Error = psycopg.Error  # what callers catch for 'database unavailable'


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
    """Call set_item_quantity(); returns {id, quantity, total_value} or None if no such item."""
    with _connect() as conn:
        return conn.execute("SELECT * FROM set_item_quantity(%s, %s)", (item_id, quantity)).fetchone()


def ping() -> None:
    with _connect() as conn:
        conn.execute("SELECT 1")

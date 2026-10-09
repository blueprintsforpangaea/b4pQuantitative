"""Sheet vs Postgres tests. DB tests need local `b4p_v2`; they are skipped if it is missing.

Sheet write-back is always disabled (credentials env removed) so tests never write to the real sheet.
Run from repo root: python -m pytest backend/tests -v -s
"""
import csv
import io
import subprocess
from collections import Counter

import pytest
import requests
from fastapi.testclient import TestClient

from backend import app as appmod

SRC_DB = "b4p_v2"
TEST_DB = "b4p_test_internal"


def _db_exists(name):
    out = subprocess.run(["psql", "-lqt"], capture_output=True, text=True).stdout
    return any(line.split("|")[0].strip() == name for line in out.splitlines())


needs_db = pytest.mark.skipif(not _db_exists(SRC_DB), reason=f"{SRC_DB} not available")


@pytest.fixture(autouse=True)
def no_sheet_writes(monkeypatch):
    monkeypatch.delenv("GOOGLE_SHEETS_CREDENTIALS_PATH", raising=False)
    monkeypatch.delenv("GOOGLE_SHEETS_CREDENTIALS_JSON", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)


client = TestClient(appmod.app)


FEED = "https://b4p-external-view-w26-backend.onrender.com/api/supplies"


@pytest.fixture(scope="module")
def sheet_csv():
    """The inventory sheet's public CSV export now returns 401, so build the CSV from the external
    dashboard's /api/supplies feed (same sheet rows, same headers, read via a service account)."""
    try:
        data = requests.get(FEED, timeout=120).json()
    except Exception as exc:
        pytest.skip(f"sheet feed unavailable: {exc}")
    headers = [h for h in data[0] if h != "_sheet_row"]
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    w.writeheader()
    w.writerows(data)
    return buf.getvalue()


class _Resp:
    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        pass


@pytest.fixture(scope="module")
def sheet(sheet_csv):
    """Real sheet-mode /items output (live CSV parser on current sheet rows)."""
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(appmod.requests, "get", lambda *a, **k: _Resp(sheet_csv))
        r = client.get("/items")
    assert r.status_code == 200 and r.headers["x-data-source"] == "sheet"
    return r.json()


@pytest.fixture
def db_mode(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"postgresql:///{SRC_DB}")


@pytest.fixture
def copy_db(monkeypatch):
    subprocess.run(["dropdb", "--if-exists", TEST_DB], check=True)
    subprocess.run(["createdb", "-T", SRC_DB, TEST_DB], check=True)
    monkeypatch.setenv("DATABASE_URL", f"postgresql:///{TEST_DB}")
    yield
    subprocess.run(["dropdb", "--if-exists", "--force", TEST_DB], check=True)


CSV = (
    "Supply ID,Name,General,Subcategories,Manufacturer Name,Quantity,Price per unit,Total Price,"
    "Date of Expiration,Days in Warehouse,Pallet Number,Box Category,Box Number\n"
    "A1,Gauze,wound,Wound Care & Bandages,Acme,4,2.5,10,2030-01-31,3,1,Wound,2\n"
)


def test_sheet_mode_unchanged(monkeypatch):
    monkeypatch.setattr(appmod.requests, "get", lambda *a, **k: _Resp(CSV))
    r = client.get("/items")
    assert r.status_code == 200 and r.headers["x-data-source"] == "sheet"
    row = r.json()[0]
    appmod.Item(**row)
    assert (row["id"], row["quantity"], row["total_value"], row["category"]) == ("A1", 4, 10.0, "Wound Care & Bandages")
    assert client.get("/health").json() == {"source": "sheet", "ok": True}
    k = client.get("/kpis")
    assert k.status_code == 200 and k.json()["total_raw_items"] == 4
    # no DB mode, no sheet creds: quantity update still reports missing credentials
    assert client.post("/items/A1/quantity", json={"quantity": 3}).status_code == 503


@needs_db
def test_db_items_valid(db_mode):
    r = client.get("/items")
    assert r.status_code == 200
    assert r.headers["x-data-source"] == "postgres"
    rows = r.json()
    assert rows
    for row in rows:
        appmod.Item(**row)
        assert "sheet_row" not in row
    assert client.get("/health").json() == {"source": "postgres", "ok": True}


@needs_db
def test_parity_db_vs_sheet(db_mode, monkeypatch, sheet):
    db_rows = client.get("/items").json()
    s_qty, d_qty = sum(r["quantity"] for r in sheet), sum(r["quantity"] for r in db_rows)
    s_val, d_val = sum(r["total_value"] for r in sheet), sum(r["total_value"] for r in db_rows)
    s_cat, d_cat = Counter(r["category"] for r in sheet), Counter(r["category"] for r in db_rows)
    s_names, d_names = {r["name"] for r in sheet}, {r["name"] for r in db_rows}
    s_ids, d_ids = {r["id"] for r in sheet}, {r["id"] for r in db_rows}
    print(f"\nrows   sheet={len(sheet)} db={len(db_rows)}")
    print(f"qty    sheet={s_qty} db={d_qty}")
    print(f"value  sheet={s_val:.2f} db={d_val:.2f}")
    print(f"names  only_sheet={len(s_names - d_names)} only_db={len(d_names - s_names)} common={len(s_names & d_names)}")
    print(f"ids    only_sheet={len(s_ids - d_ids)} only_db={len(d_ids - s_ids)} common={len(s_ids & d_ids)}")
    print("category diff:", {c: (s_cat[c], d_cat[c]) for c in set(s_cat) | set(d_cat) if s_cat[c] != d_cat[c]})
    # Live sheet may drift from the DB snapshot, so allow small tolerance.
    assert abs(len(sheet) - len(db_rows)) <= max(5, 0.02 * len(sheet))
    assert abs(s_qty - d_qty) <= 0.02 * max(s_qty, 1)
    assert abs(s_val - d_val) <= 0.02 * max(s_val, 1)


@needs_db
def test_kpis_match(db_mode, monkeypatch, sheet_csv):
    d = client.get("/kpis")
    assert d.status_code == 200 and d.headers["x-data-source"] == "postgres"
    d = d.json()
    monkeypatch.delenv("DATABASE_URL")
    monkeypatch.setattr(appmod.requests, "get", lambda *a, **k: _Resp(sheet_csv))
    s = client.get("/kpis").json()
    for key in ("total_entries", "total_raw_items", "total_value", "pallet_count", "box_count"):
        print(f"kpi {key}: sheet={s[key]} db={d[key]}")
    assert d["total_entries"] > 0
    assert abs(s["total_raw_items"] - d["total_raw_items"]) <= 0.02 * max(s["total_raw_items"], 1)
    assert abs(s["total_value"] - d["total_value"]) <= 0.02 * max(s["total_value"], 1)
    assert d["expiry_ranges"].keys() == s["expiry_ranges"].keys()


def test_db_unreachable_falls_back_to_sheet(monkeypatch, caplog, sheet_csv):
    monkeypatch.setattr(appmod.requests, "get", lambda *a, **k: _Resp(sheet_csv))
    monkeypatch.setenv("DATABASE_URL", "postgresql://127.0.0.1:1/nope?connect_timeout=2")
    r = client.get("/items")
    assert "falling back" in caplog.text
    assert r.status_code == 200
    assert r.headers["x-data-source"] == "sheet"
    assert client.get("/health").json() == {"source": "postgres", "ok": False}


def test_quantity_update_503_when_db_down(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://127.0.0.1:1/nope")
    assert client.post("/items/x/quantity", json={"quantity": 3}).status_code == 503


@needs_db
def test_quantity_update_on_copy(copy_db):
    items = client.get("/items").json()
    target = next(i for i in items if i["quantity"] > 0)
    new_q = target["quantity"] + 7
    r = client.post(f"/items/{target['id']}/quantity", json={"quantity": new_q})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["item_id"] == target["id"] and body["quantity"] == new_q
    assert body["total_value"] == pytest.approx(new_q * target["unit_value"], abs=0.01)
    after = {i["id"]: i for i in client.get("/items").json()}
    assert after[target["id"]]["quantity"] == new_q
    assert after[target["id"]]["total_value"] == pytest.approx(body["total_value"], abs=0.01)
    assert len(after) == len(items)


@needs_db
def test_quantity_update_errors(copy_db):
    assert client.post("/items/x/quantity", json={"quantity": 0}).status_code == 400
    assert client.post("/items/NO-SUCH-ID/quantity", json={"quantity": 2}).status_code == 404

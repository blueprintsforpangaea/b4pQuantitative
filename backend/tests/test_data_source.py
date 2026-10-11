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
    monkeypatch.setenv("ADMIN_TOKEN", "test-token")


client = TestClient(appmod.app, headers={"X-Admin-Token": "test-token"})
anon = TestClient(appmod.app)


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


def test_db_unreachable_is_503_no_fallback(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://127.0.0.1:1/nope?connect_timeout=2")
    for path in ("/items", "/kpis"):
        r = client.get(path)
        assert r.status_code == 503 and r.json()["detail"] == "Database unavailable."
    assert client.get("/health").json() == {"source": "postgres", "ok": False}


def test_quantity_update_503_when_db_down(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://127.0.0.1:1/nope")
    r = client.post("/items/x/quantity", json={"quantity": 3})
    assert r.status_code == 503 and "127.0.0.1" not in r.text


def test_quantity_range_validated():
    for q in (-1, 1_000_000, 99999999999):
        assert client.post("/items/1/quantity", json={"quantity": q}).status_code == 422


def test_cors_allow_list():
    h = {"Access-Control-Request-Method": "POST"}
    bad = client.options("/items/1/quantity", headers={**h, "Origin": "https://evil.test"})
    assert "access-control-allow-origin" not in bad.headers
    ok = client.options("/items/1/quantity", headers={**h, "Origin": "http://localhost:5173"})
    assert ok.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-credentials" not in ok.headers


def test_admin_token(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "s3cret")
    monkeypatch.setenv("DATABASE_URL", "postgresql://127.0.0.1:1/nope")  # past auth -> 503
    assert anon.post("/items/1/quantity", json={"quantity": 1}).status_code == 401
    assert anon.post("/items/1/quantity", json={"quantity": 1}, headers={"X-Admin-Token": "bad"}).status_code == 401
    assert anon.post("/items/1/quantity", json={"quantity": 1}, headers={"X-Admin-Token": "s3cret"}).status_code == 503


@pytest.mark.parametrize("value", [None, "", "   "])
def test_fails_closed_without_admin_token(monkeypatch, value):
    if value is None:
        monkeypatch.delenv("ADMIN_TOKEN")
    else:
        monkeypatch.setenv("ADMIN_TOKEN", value)
    r = anon.post("/items/1/quantity", json={"quantity": 1})
    assert r.status_code == 403 and "ADMIN_TOKEN not set" in r.text


def test_box_count_includes_pallet(monkeypatch):
    def item(p, c, b):
        return appmod.Item(id="x", name="n", gen_name="", category="Gloves", manufacturer="m", quantity=1,
                           unit_value=0, total_value=0, warehouse_date="2026-01-01",
                           pallet_number=p, category_box=c, box_number=b)

    monkeypatch.setattr(appmod, "fetch_items_from_sheet", lambda: [item(1, "A", 1), item(2, "A", 1)])
    assert client.get("/kpis").json()["box_count"] == 2


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
    assert client.post("/items/NO-SUCH-ID/quantity", json={"quantity": 0}).status_code == 404
    assert client.post("/items/NO-SUCH-ID/quantity", json={"quantity": 2}).status_code == 404


@needs_db
def test_quantity_zero_allowed(copy_db):
    r = client.post("/items/1/quantity", json={"quantity": 0})
    assert r.status_code == 200 and r.json()["quantity"] == 0


@needs_db
def test_constraint_error_is_400_and_not_leaked(copy_db):
    # bypass pydantic to hit the DB function's own validation
    from backend import db
    with pytest.raises(db.Error):
        db.set_quantity("1", -5)
    r = client.post("/items/1/quantity", json={"quantity": 999_999})
    assert r.status_code in (200, 400)
    assert "postgres" not in r.text.lower() and "DETAIL" not in r.text


class FakeWS:
    """Stands in for the 'Final Inventorying' tab, built from the DB copy."""

    def __init__(self, rows):
        self.rows, self.writes = rows, []

    def row_values(self, n):
        return ["Name", "Quantity", "Image URL"] if n == 1 else self.rows.get(n, [])

    def update_cell(self, r, c, v):
        self.writes.append((r, c, v))


@needs_db
def test_writeback_targets_sheet_row_with_image_check(copy_db, monkeypatch):
    """Regression: write-back must hit the item's own row in the inventory tab, never another product."""
    monkeypatch.setenv("GOOGLE_SHEETS_CREDENTIALS_JSON", "{}")
    items = client.get("/items").json()
    import json as _json
    info = _json.loads(subprocess.run(["psql", TEST_DB, "-Atc", "select json_agg(json_build_object('id',id,'sheet_row',sheet_row)) from dash_items"],
                                      capture_output=True, text=True).stdout)
    rows_by_id = {r["id"]: r["sheet_row"] for r in info}
    target = next(i for i in items if i["image_url"])
    sheet_row = rows_by_id[target["id"]]
    ws = FakeWS({sheet_row: [target["name"], "1", target["image_url"]]})
    seen = {}
    monkeypatch.setattr(appmod, "get_gspread_worksheet", lambda gid="x": seen.setdefault("gid", gid) and ws)
    r = client.post(f"/items/{target['id']}/quantity", json={"quantity": 4})
    assert r.status_code == 200
    assert seen["gid"] == "1019735220"
    assert ws.writes == [(sheet_row, 2, 4)]

    ws.writes.clear()  # rows shifted: image URL no longer matches -> skip
    ws.rows[sheet_row] = ["Other product", "9", "https://example.test/other.png"]
    assert client.post(f"/items/{target['id']}/quantity", json={"quantity": 5}).status_code == 200
    assert ws.writes == []


@needs_db
@pytest.mark.parametrize("pid", ["%205%20", "05"])
def test_id_variants_do_not_500(copy_db, pid):
    r = client.post(f"/items/{pid}/quantity", json={"quantity": 4})
    assert r.status_code in (200, 404), r.text


@needs_db
@pytest.mark.parametrize("db_image,sheet_name,sheet_image", [
    (None, "SAME", ""),                      # both URLs blank
    ("https://x.test/a.png", "Other", "https://x.test/a.png"),  # same image, different name
])
def test_writeback_skipped_on_weak_match(copy_db, monkeypatch, db_image, sheet_name, sheet_image):
    monkeypatch.setenv("GOOGLE_SHEETS_CREDENTIALS_JSON", "{}")
    subprocess.run(["psql", TEST_DB, "-qc", "update inventory_item set image_url = %s where item_id = 1" % ("NULL" if db_image is None else f"'{db_image}'")], check=True)
    item = next(i for i in client.get("/items").json() if i["id"] == "1")
    row = subprocess.run(["psql", TEST_DB, "-Atc", "select sheet_row from dash_items where id='1'"], capture_output=True, text=True).stdout.strip()
    name = item["name"] if sheet_name == "SAME" else sheet_name
    ws = FakeWS({int(row): [name, "1", sheet_image]})
    monkeypatch.setattr(appmod, "get_gspread_worksheet", lambda gid="x": ws)
    assert client.post("/items/1/quantity", json={"quantity": 3}).status_code == 200
    assert ws.writes == []


# ---- stock alerts ----
from datetime import date, timedelta

from backend.alerts import build_alerts


def _it(id, qty, exp, value=0.0):
    return appmod.Item(id=id, name=f"n{id}", gen_name="", category="Gloves", manufacturer="x", quantity=qty,
                       unit_value=0, total_value=value, expiration_date=exp, warehouse_date="2026-01-01",
                       pallet_number=1, category_box="A", box_number=1)


def test_alert_buckets_and_boundaries():
    t = date(2026, 10, 11)
    d = lambda n: (t + timedelta(days=n)).isoformat()
    items = [_it("a", 9, d(0)), _it("b", 9, d(-5)), _it("c", 9, d(1)), _it("d", 9, d(90)), _it("e", 9, d(91)),
             _it("f", 9, None), _it("g", 3, d(400)), _it("h", 0, None)]
    r = build_alerts(items, soon_days=90, low_stock=3, today=t)
    assert [x["id"] for x in r["expired"]] == ["b", "a"]  # expiring today counts as expired, most overdue first
    assert [x["id"] for x in r["expiring_soon"]] == ["c", "d"]
    assert [x["id"] for x in r["low_stock_items"]] == ["h", "g"]
    assert r["summary"]["expired"] == {"entries": 2, "units": 18, "value": 0.0}


@needs_db
def test_alerts_endpoint_matches_sql(db_mode):
    r = client.get("/stock-alerts?soon_days=90&low_stock=3")
    assert r.status_code == 200 and r.headers["x-data-source"] == "postgres"
    body = r.json()
    q = lambda sql: subprocess.run(["psql", SRC_DB, "-Atc", sql], capture_output=True, text=True).stdout.strip()
    assert str(body["summary"]["expired"]["entries"]) == q("select count(*) from dash_items where expiration_date <= current_date::text")
    assert str(body["summary"]["expiring_soon"]["entries"]) == q(
        "select count(*) from dash_items where expiration_date > current_date::text and expiration_date <= (current_date+90)::text")
    assert str(body["summary"]["low_stock"]["entries"]) == q("select count(*) from dash_items where quantity <= 3")
    assert client.get("/stock-alerts?soon_days=0").status_code == 422


def test_alerts_503_when_db_down(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost:1/none")
    assert client.get("/stock-alerts").status_code == 503


# ---- requests ----
def test_group_request_lines():
    line = lambda rid, item, qty, ts, flag="FALSE": {"Request ID": rid, "Org Name": "O", "Org Email": "o@x", "Item Name": item,
        "Category": "", "Quantity Requested": qty, "Status": "Under Review", "Timestamp": ts, "Review Flag": flag}
    out = appmod.group_request_lines([line("A", "i1", "2", "2026-01-01"), line("A", "i2", "3", "2026-01-01", "TRUE"), line("B", "i3", "1", "2026-02-01")])
    assert [r["request_id"] for r in out] == ["B", "A"]
    assert out[1]["items"] == [{"item_name": "i1", "category": "", "quantity": 2}, {"item_name": "i2", "category": "", "quantity": 3}]
    assert out[1]["review_flag"] is True and out[0]["review_flag"] is False


def test_requests_need_admin_and_db(monkeypatch):
    assert anon.get("/requests").status_code == 401
    assert client.get("/requests").status_code == 503  # sheet mode: no DATABASE_URL
    assert anon.post("/requests/X/status", json={"status": "Approved"}).status_code == 401
    monkeypatch.delenv("ADMIN_TOKEN")
    assert client.get("/requests").status_code == 403


@needs_db
def test_requests_list_matches_db(db_mode):
    r = client.get("/requests")
    assert r.status_code == 200
    n_lines = int(subprocess.run(["psql", SRC_DB, "-Atc", "select count(*) from dash_requests"], capture_output=True, text=True).stdout)
    n_reqs = int(subprocess.run(["psql", SRC_DB, "-Atc", 'select count(distinct "Request ID") from dash_requests'], capture_output=True, text=True).stdout)
    body = r.json()
    assert len(body["requests"]) == n_reqs
    assert sum(len(x["items"]) for x in body["requests"]) == n_lines


@needs_db
def test_request_status_workflow(copy_db):
    subprocess.run(["psql", TEST_DB, "-qc", "select create_request('Test Org', 't@example.org', '[{\"item_name\":\"Gauze\",\"quantity\":2}]')"], check=True)
    rid = subprocess.run(["psql", TEST_DB, "-Atc", 'select "Request ID" from dash_requests where "Org Name"=\'Test Org\''], capture_output=True, text=True).stdout.strip()
    assert rid.startswith("REQ-")
    assert client.post(f"/requests/{rid}/status", json={"status": "Approved"}).status_code == 200
    r = client.post(f"/requests/{rid}/status", json={"status": "Under Review"})
    assert r.status_code == 409 and "cannot change request" in r.json()["detail"]
    assert client.post(f"/requests/{rid}/status", json={"status": "bogus"}).status_code == 400
    assert client.post("/requests/REQ-nope/status", json={"status": "Shipped"}).status_code == 404
    mine = [x for x in client.get("/requests").json()["requests"] if x["request_id"] == rid][0]
    assert mine["status"] == "Approved" and mine["items"][0]["quantity"] == 2
    assert client.post(f"/requests/{rid}/status", json={"status": "Delivered"}).status_code == 200
    assert client.post(f"/requests/{rid}/status", json={"status": "Cancelled"}).status_code == 409


def test_request_status_503_when_db_down(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost:1/none")
    assert client.get("/requests").status_code == 503
    assert client.post("/requests/X/status", json={"status": "Approved"}).status_code == 503

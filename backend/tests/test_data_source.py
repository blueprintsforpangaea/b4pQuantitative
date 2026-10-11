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
    monkeypatch.setenv("ITEMS_CACHE_SECONDS", "0")
    appmod.clear_items_cache()


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


TEMPLATE_DB = "b4p_dash_tpl"


@pytest.fixture(scope="session")
def template_db():
    """A private snapshot of b4p_v2 (pg_dump, which takes no exclusive lock) that tests copy with
    createdb -T, so they never fail because another session is connected to b4p_v2."""
    if not _db_exists(SRC_DB):
        pytest.skip(f"{SRC_DB} not available")
    subprocess.run(["dropdb", "--if-exists", "--force", TEMPLATE_DB], check=True)
    subprocess.run(["createdb", TEMPLATE_DB], check=True)
    dump = subprocess.run(["pg_dump", "--no-owner", SRC_DB], capture_output=True, check=True).stdout
    subprocess.run(["psql", "-q", "-v", "ON_ERROR_STOP=1", TEMPLATE_DB], input=dump, capture_output=True, check=True)
    yield TEMPLATE_DB
    subprocess.run(["dropdb", "--if-exists", "--force", TEMPLATE_DB], check=True)


@pytest.fixture
def copy_db(monkeypatch, template_db):
    subprocess.run(["dropdb", "--if-exists", "--force", TEST_DB], check=True)
    subprocess.run(["createdb", "-T", template_db, TEST_DB], check=True)
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
    assert r["summary"]["expired"] == {"entries": 2, "priced": 0, "units": 18, "value": 0.0}


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
    r = client.get("/requests")
    assert r.status_code == 403 and r.json()["detail"] == "Admin features are disabled (ADMIN_TOKEN not set)."
    assert client.post("/items/A1/quantity", json={"quantity": 1}).json()["detail"] == "Admin features are disabled (ADMIN_TOKEN not set)."


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


# ---- cache ----
@needs_db
def test_items_cache_hits_and_invalidates_on_edit(copy_db, monkeypatch):
    monkeypatch.setenv("ITEMS_CACHE_SECONDS", "60")
    appmod.clear_items_cache()
    calls = []
    real = appmod.db.fetch_items
    monkeypatch.setattr(appmod.db, "fetch_items", lambda: calls.append(1) or real())
    first = client.get("/items").json()
    client.get("/kpis"), client.get("/stock-alerts")
    assert len(calls) == 1  # one query served all three
    item = first[0]
    new_qty = item["quantity"] + 7
    assert client.post(f"/items/{item['id']}/quantity", json={"quantity": new_qty}).status_code == 200
    after = {r["id"]: r for r in client.get("/items").json()}
    assert len(calls) == 2 and after[item["id"]]["quantity"] == new_qty


@needs_db
def test_items_cache_expires(copy_db, monkeypatch):
    monkeypatch.setenv("ITEMS_CACHE_SECONDS", "60")
    appmod.clear_items_cache()
    calls = []
    real = appmod.db.fetch_items
    monkeypatch.setattr(appmod.db, "fetch_items", lambda: calls.append(1) or real())
    client.get("/items")
    appmod._items_cache["at"] -= 61
    client.get("/items")
    assert len(calls) == 2


@needs_db
def test_status_edit_drops_items_cache(copy_db, monkeypatch):
    monkeypatch.setenv("ITEMS_CACHE_SECONDS", "60")
    appmod.clear_items_cache()
    client.get("/items")
    assert appmod._items_cache["items"] is not None
    rid = subprocess.run(["psql", TEST_DB, "-Atc", 'select "Request ID" from dash_requests limit 1'], capture_output=True, text=True).stdout.strip()
    assert client.post(f"/requests/{rid}/status", json={"status": "Approved"}).status_code == 200
    assert appmod._items_cache["items"] is None
    # a rejected edit leaves the cache alone
    client.get("/items")
    assert client.post(f"/requests/{rid}/status", json={"status": "Under Review"}).status_code == 409
    assert appmod._items_cache["items"] is not None


# ---- sync status ----
def test_sync_status_sheet_mode_and_db_down(monkeypatch):
    assert client.get("/sync-status").json() == {"source": "sheet"}
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost:1/none")
    assert client.get("/sync-status").status_code == 503


@needs_db
def test_sync_status_matches_view(db_mode):
    body = client.get("/sync-status").json()
    q = lambda sql: subprocess.run(["psql", SRC_DB, "-Atc", sql], capture_output=True, text=True).stdout.strip()
    assert body["source"] == "postgres"
    assert str(body["active_items"]) == q("select active_items from dash_sync_status")
    assert (body["last_success_at"] is None) == (q("select last_success_at from dash_sync_status") == "")
    assert body["last_run_ok"] is (q("select last_run_ok from dash_sync_status") == "t")


# ---- bug-hunter fixes ----
def test_unassigned_items_do_not_count_as_pallet_or_box(monkeypatch):
    mk = lambda id, pal, cat, box: _it(id, 1, None).model_copy(update={"pallet_number": pal, "category_box": cat, "box_number": box})
    items = [mk("1", 1, "A", 1), mk("2", 1, "A", 1), mk("3", 2, "B", 2), mk("4", 0, "Unassigned", 0), mk("5", 2, "Unassigned", 0)]
    monkeypatch.setattr(appmod, "load_items", lambda response: items)
    k = client.get("/kpis").json()
    assert (k["pallet_count"], k["box_count"]) == (2, 2)


@needs_db
def test_kpi_pallets_boxes_match_v_kpis_with_unassigned_items(copy_db):
    psql = lambda sql: subprocess.run(["psql", TEST_DB, "-Atc", sql], capture_output=True, text=True).stdout.strip()
    psql("update inventory_item set box_id = NULL where item_id in (select item_id from inventory_item order by item_id limit 15)")
    k = client.get("/kpis").json()
    assert f"{k['pallet_count']}|{k['box_count']}" == psql("select pallet_count || '|' || box_count from v_kpis")


def test_javascript_image_urls_are_dropped():
    for bad in ("javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,x", "//evil.example/x"):
        assert _it("x", 1, None).model_copy().__class__(**{**_it("x", 1, None).model_dump(), "image_url": bad}).image_url is None
    ok = "https://drive.google.com/file/d/abc/view"
    assert appmod.Item(**{**_it("x", 1, None).model_dump(), "image_url": ok}).image_url == ok


def test_sheet_mode_accepts_zero_quantity(monkeypatch):
    class WS:
        def row_values(self, n): return ["Supply ID", "Quantity", "Total Price", "Price per unit"]
        def get_all_records(self): return [{"Supply ID": "A1", "Price per unit": "2"}]
        def batch_update(self, updates, **kw): self.updates = updates
    ws = WS()
    monkeypatch.setattr(appmod, "get_gspread_worksheet", lambda *a, **k: ws)
    monkeypatch.setattr(appmod, "gspread", type("G", (), {"utils": type("U", (), {"rowcol_to_a1": staticmethod(lambda r, c: f"R{r}C{c}")})}))
    r = client.post("/items/A1/quantity", json={"quantity": 0})
    assert r.status_code == 200 and r.json()["quantity"] == 0
    assert client.post("/items/A1/quantity", json={"quantity": -1}).status_code == 422


@needs_db
def test_status_response_is_canonical(copy_db):
    rid = subprocess.run(["psql", TEST_DB, "-Atc", 'select "Request ID" from dash_requests limit 1'], capture_output=True, text=True).stdout.strip()
    assert client.post(f"/requests/{rid}/status", json={"status": "approved"}).json()["status"] == "Approved"
    assert client.post(f"/requests/{rid}/status", json={"status": "SHIPPED"}).json()["status"] == "Shipped"


def test_alerts_skip_zero_quantity_and_flag_priced():
    t = date(2026, 10, 11)
    priced = _it("p", 0, (t - timedelta(days=3)).isoformat()).model_copy(update={"unit_value": 2.0})
    live = _it("q", 2, (t - timedelta(days=3)).isoformat()).model_copy(update={"unit_value": 2.0, "total_value": 4.0})
    soon = _it("s", 0, (t + timedelta(days=3)).isoformat())
    r = build_alerts([priced, live, soon], today=t)
    assert [x["id"] for x in r["expired"]] == ["q"] and r["expiring_soon"] == []
    assert r["summary"]["expired"]["priced"] == 1
    assert [x["id"] for x in r["low_stock_items"]] == ["p", "s", "q"]  # low stock still lists zero-quantity rows


# ---- CSV exports ----
import csv as _csv


def _rows(text):
    return list(_csv.reader(io.StringIO(text)))


def test_csv_formula_cells_are_neutralised():
    from backend.exports import to_csv
    out = _rows(to_csv(["a"], [["=HYPERLINK(\"http://x\")"], ["+1"], ["-1"], ["@x"], ["ok"], [5]]))
    assert [r[0] for r in out[1:]] == ["'=HYPERLINK(\"http://x\")", "'+1", "'-1", "'@x", "ok", "5"]


def test_packing_list_matches_by_name_earliest_expiry_first():
    from backend.exports import packing_list_csv
    named = lambda id, name, qty, exp: _it(id, qty, exp).model_copy(update={"name": name, "pallet_number": 2, "category_box": "ER", "box_number": int(id)})
    items = [named("1", "Gauze", 5, "2030-01-01"), named("2", "gauze", 5, "2027-01-01"), named("3", "Gauze", 0, "2026-01-01"), named("4", "Saline", 9, None)]
    req = {"request_id": "REQ-1", "org_name": "Clinic", "items": [
        {"item_name": "GAUZE", "category": "", "quantity": 3}, {"item_name": "Tape", "category": "", "quantity": 1}]}
    rows = _rows(packing_list_csv(req, items))
    assert [r[5] for r in rows[1:3]] == ["2", "1"]  # earliest expiration first, out-of-stock row skipped
    assert rows[1][8:10] == ["ER", "2"] and rows[1][7] == "2"
    assert rows[3][4] == "Not found in stock" and len(rows) == 4


def test_expiring_csv_endpoint_sheet_mode(monkeypatch):
    t = date.today()
    items = [_it("a", 2, (t - timedelta(days=2)).isoformat()), _it("b", 2, (t + timedelta(days=20)).isoformat()), _it("c", 2, (t + timedelta(days=200)).isoformat())]
    monkeypatch.setattr(appmod, "load_items", lambda response: items)
    r = client.get("/stock-alerts.csv?soon_days=30")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    rows = _rows(r.text)
    assert [(x[0], x[1]) for x in rows[1:]] == [("Expired", "a"), ("Expiring soon", "b")]


@needs_db
def test_packing_list_endpoint(copy_db):
    psql = lambda sql: subprocess.run(["psql", TEST_DB, "-Atc", sql], capture_output=True, text=True).stdout.strip()
    name = psql("select name from dash_items where quantity > 0 limit 1").replace("'", "''")
    psql(f"select create_request('Pack Org', 'p@example.org', jsonb_build_array(jsonb_build_object('item_name', '{name}', 'quantity', 2), jsonb_build_object('item_name', 'No such thing', 'quantity', 1)))")
    rid = psql("select \"Request ID\" from dash_requests where \"Org Name\" = 'Pack Org' limit 1")
    assert anon.get(f"/requests/{rid}/packing-list.csv").status_code == 401
    r = client.get(f"/requests/{rid}/packing-list.csv")
    assert r.status_code == 200
    rows = _rows(r.text)
    assert rows[0][0] == "Request" and any(x[4] == "In stock" for x in rows[1:]) and rows[-1][4] == "Not found in stock"
    assert client.get("/requests/REQ-nope/packing-list.csv").status_code == 404


@needs_db
def test_sync_status_refused_run_is_not_ok(copy_db):
    psql = lambda sql: subprocess.run(["psql", TEST_DB, "-Atc", sql], capture_output=True, text=True).stdout.strip()
    assert client.get("/sync-status").json()["last_run_refused"] is False
    # simulate the view gaining the new column (older views simply lack it)
    real = appmod.db.fetch_sync_status
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(appmod.db, "fetch_sync_status", lambda: {**real(), "last_run_ok": True, "last_run_refused": True})
        body = client.get("/sync-status").json()
    assert body["last_run_ok"] is False and body["last_run_refused"] is True


@needs_db
def test_sync_status_refused_run_real_column(copy_db):
    """Against the real dash_sync_status.last_run_refused column (a run stopped by a safety guard)."""
    psql = lambda sql: subprocess.run(["psql", TEST_DB, "-qAtc", sql], capture_output=True, text=True, check=True).stdout.strip()
    before = client.get("/sync-status").json()
    psql("insert into sync_run(started_at, finished_at, source, refused) values (now(), now(), 'service-account:Final Inventorying', 'wrong tab')")
    body = client.get("/sync-status").json()
    assert body["last_run_refused"] is True and body["last_run_ok"] is False
    assert body["last_success_at"] == before["last_success_at"]  # a refused run is not a success
    psql("insert into sync_run(started_at, finished_at, source) values (now(), now(), 'service-account:Final Inventorying')")
    ok = client.get("/sync-status").json()
    assert ok["last_run_refused"] is False and ok["last_run_ok"] is True and ok["last_success_at"] != before["last_success_at"]


# ---- packing list: names from the external site carry a [Lot, Box, Pallet] suffix ----
def test_parse_requested_name():
    from backend.exports import parse_requested_name
    assert parse_requested_name("Nitrile Gloves Medium [Lot L9, Box 1, Pallet 2]") == {"name": "Nitrile Gloves Medium", "lot": "L9", "box": 1, "pallet": 2}
    assert parse_requested_name("Gauze")["name"] == "Gauze" and parse_requested_name("Gauze")["box"] is None
    assert parse_requested_name("Tube [Lot A 1]")["lot"] == "A 1"
    assert parse_requested_name("X [odd]")["name"] == "X [odd]"  # not a lot suffix: part of the name
    assert parse_requested_name("Tape [Pack of 12]")["name"] == "Tape [Pack of 12]"
    assert parse_requested_name("Tape [Pack of 12] [Lot 5, Box 2]") == {"name": "Tape [Pack of 12]", "lot": "5", "box": 2, "pallet": None}
    assert parse_requested_name("Tape [lot 5]")["lot"] == "5"


def test_packing_list_handles_suffix_case_and_whitespace():
    from backend.exports import packing_list_csv
    named = lambda id, name, qty, exp, pal, box: _it(id, qty, exp).model_copy(update={"name": name, "pallet_number": pal, "category_box": "ER", "box_number": box})
    items = [named("1", "NITRILE GLOVES MEDIUM", 5, "2026-12-01", 1, 1),     # exact box/pallet, later expiry
             named("2", "NITRILE GLOVES MEDIUM", 5, "2026-01-01", 2, 7),     # same name elsewhere, earlier expiry
             named("3", "Nitrile  Gloves   Large", 5, None, 1, 1)]
    req = {"request_id": "REQ-9", "org_name": "O", "items": [
        {"item_name": "Nitrile Gloves Medium [Lot L9, Box 1, Pallet 1]", "category": "", "quantity": 2},
        {"item_name": "nitrile gloves large", "category": "", "quantity": 1},
        {"item_name": "Nitrile Gloves Small [Lot Z, Box 1, Pallet 1]", "category": "", "quantity": 1}]}
    rows = _rows(packing_list_csv(req, items))
    hdr = rows[0]
    col = lambda r, name: r[hdr.index(name)]
    assert [col(r, "Supply ID") for r in rows[1:3]] == ["1", "2"]  # requested box/pallet first, then the other stock
    assert [col(r, "In requested lot, box and pallet") for r in rows[1:3]] == ["No", "No"]  # these rows carry no lot, so the lot can't match
    assert col(rows[1], "Requested lot") == "L9" and col(rows[1], "Requested box") == "1"
    assert col(rows[3], "Match") == "In stock" and col(rows[3], "Supply ID") == "3"  # case and spacing ignored
    assert col(rows[4], "Match") == "Not found in stock"


# ---- over-commit warnings (display only) ----
def test_over_commit_warnings():
    from backend.exports import add_stock_warnings
    stock = [_it("1", 8, None).model_copy(update={"name": "NITRILE GLOVES MEDIUM"}), _it("2", 0, None).model_copy(update={"name": "Tape"})]
    req = lambda rid, status, name, qty: {"request_id": rid, "status": status, "items": [{"item_name": name, "category": "", "quantity": qty}]}
    reqs = [req("A", "Approved", "Nitrile Gloves Medium [Lot L9, Box 1, Pallet 1]", 6),
            req("B", "Under Review", "nitrile  gloves medium", 6),
            req("C", "Under Review", "Nitrile Gloves Medium", 2),
            req("D", "Delivered", "Nitrile Gloves Medium", 50),
            req("E", "Under Review", "Tape", 1)]
    add_stock_warnings(reqs, stock)
    w = {r["request_id"]: r["warnings"] for r in reqs}
    assert w["A"] == []                                                    # 6 approved of 8 is fine
    assert w["B"] == [{"item_name": "NITRILE GLOVES MEDIUM", "committed": 12, "in_stock": 8, "match": "exact"}]  # 6 + 6 of 8
    assert w["C"] == []                                                    # 6 + 2 = 8 fits exactly
    assert w["D"] == []                                                    # closed requests get no warning
    assert w["E"] == [{"item_name": "Tape", "committed": 1, "in_stock": 0, "match": "exact"}]  # known item, none on hand: real shortage


def test_approved_request_warns_when_approvals_exceed_stock():
    from backend.exports import add_stock_warnings
    stock = [_it("1", 8, None).model_copy(update={"name": "Gauze"})]
    req = lambda rid, qty: {"request_id": rid, "status": "Approved", "items": [{"item_name": "Gauze", "category": "", "quantity": qty}]}
    reqs = [req("A", 6), req("B", 6)]
    add_stock_warnings(reqs, stock)
    assert [r["warnings"][0]["committed"] for r in reqs] == [12, 12]


@needs_db
def test_requests_endpoint_includes_warnings(copy_db):
    psql = lambda sql: subprocess.run(["psql", TEST_DB, "-qAtc", sql], capture_output=True, text=True, check=True).stdout.strip()
    name, qty = psql("select name || '|' || quantity from dash_items where quantity > 0 and name !~ '[|]' limit 1").rsplit("|", 1)
    n = name.replace("'", "''")
    psql(f"select create_request('Warn Org', 'w@example.org', jsonb_build_array(jsonb_build_object('item_name', '{n}', 'quantity', {int(qty) + 1})))")
    mine = [r for r in client.get("/requests").json()["requests"] if r["org_name"] == "Warn Org"][0]
    assert mine["warnings"] and mine["warnings"][0]["committed"] == int(qty) + 1


def test_unmatched_names_get_a_note_not_a_warning():
    from backend.exports import add_stock_warnings
    stock = [_it("1", 8, None).model_copy(update={"name": "Gauze"})]
    reqs = [{"request_id": "A", "status": "Under Review", "items": [
        {"item_name": "Gauze", "category": "", "quantity": 2},
        {"item_name": "Gauzze [Lot 1, Box 2, Pallet 1]", "category": "", "quantity": 99}]}]
    add_stock_warnings(reqs, stock)
    assert reqs[0]["warnings"] == [] and reqs[0]["unmatched"] == ["Gauzze"]


def test_bracketed_inventory_names_still_match():
    from backend.exports import add_stock_warnings, packing_list_csv
    stock = [_it("1", 8, None).model_copy(update={"name": "Tape [Pack of 12]"})]
    req = {"request_id": "R", "org_name": "O", "status": "Under Review", "items": [
        {"item_name": "Tape [Pack of 12] [Lot 5, Box 1, Pallet 1]", "category": "", "quantity": 2},
        {"item_name": "tape [pack of 12]", "category": "", "quantity": 1}]}
    rows = _rows(packing_list_csv(req, stock))
    assert [r[4] for r in rows[1:]] == ["In stock", "In stock"]
    add_stock_warnings([req], stock)
    assert req["unmatched"] == [] and req["warnings"] == []


def test_packing_list_prefers_the_exact_lot():
    from backend.exports import packing_list_csv
    mk = lambda id, lot, exp, pal, box: _it(id, 5, exp).model_copy(update={"name": "Gauze", "lot_number": lot, "pallet_number": pal, "box_number": box})
    items = [mk("1", "A1", "2026-01-01", 1, 1),   # earliest expiry, wrong lot, right box/pallet
             mk("2", "L9", "2027-01-01", 1, 1),   # exact lot, box and pallet
             mk("3", "L9", "2026-06-01", 2, 5),   # right lot only
             mk("4", None, "2026-02-01", 3, 3)]
    req = {"request_id": "R", "org_name": "O", "items": [{"item_name": "gauze [Lot l9, Box 1, Pallet 1]", "category": "", "quantity": 1}]}
    rows = _rows(packing_list_csv(req, items))
    hdr = rows[0]
    ids = [r[hdr.index("Supply ID")] for r in rows[1:]]
    assert ids == ["2", "1", "3", "4"]  # 3 of 3 matches, then 2 of 3 (box+pallet), then 1 (lot), then none
    flags = [r[hdr.index("In requested lot, box and pallet")] for r in rows[1:]]
    assert flags == ["Yes", "No", "No", "No"]
    assert rows[1][hdr.index("Lot")] == "L9"


@needs_db
def test_items_expose_lot_number(db_mode):
    items = client.get("/items").json()
    assert any(i["lot_number"] for i in items) and all("lot_number" in i for i in items)


# ---- approximate (token) matching ----
def _inv(id, name, qty=5, exp=None, **kw):
    return _it(id, qty, exp).model_copy(update={"name": name, **kw})


def test_significant_tokens_ignore_punctuation_stopwords_and_unit_spacing():
    from backend.exports import significant_tokens
    assert significant_tokens('BD Vacutainer Safety-Lok Blood Collection Set 21G x 3/4" x 12"') == frozenset(
        {"vacutainer", "safety", "lok", "blood", "collection", "set", "21g"}) | {"bd"} - {"bd"} | frozenset()
    assert significant_tokens("Needle 21 G") == significant_tokens("needle 21G")
    assert significant_tokens("Tape and the Gauze") == frozenset({"tape", "gauze"})


def test_find_match_exact_approximate_candidates_none():
    from backend.exports import _norm, find_match, _products
    products = _products([_inv("1", 'BD Vacutainer Safety-Lok Blood Collection Set 21G x 3/4" x 12"'),
                          _inv("2", 'BD Vacutainer Safety-Lok Blood Collection Set 23G x 3/4" x 12"'),
                          _inv("3", "Gauze 4x4 sterile"), _inv("4", "Gauze 4x4 latex"), _inv("5", "Tape")])
    assert find_match("tape", products) == ("exact", ["tape"])
    kind, keys = find_match("BD Vacutainer Safety-Lok Blood Collection Set 21G", products)
    assert kind == "approximate" and len(keys) == 1 and "21g" in keys[0]
    kind, keys = find_match("BD Vacutainer Safety-Lok Blood Collection Set", products)
    assert kind == "candidates" and len(keys) == 2          # two products tie: never pick one
    assert find_match("Gauze 4x4", products)[0] == "candidates"   # sterile vs latex: same score
    assert find_match("Gauze 4x4 sterile", products) == ("exact", ["gauze 4x4 sterile"])
    assert find_match("Surgical scissors", products) == ("none", [])
    assert find_match("an of the", products) == ("none", [])


def test_approximate_closest_name_wins_over_longer_ones():
    from backend.exports import find_match, _products
    products = _products([_inv("1", "Tape"), _inv("2", "Medical Tape Roll Waterproof Large")])
    assert find_match("Tape Roll", products) == ("approximate", ["medical tape roll waterproof large"])


def test_packing_list_labels_approximate_and_candidates():
    from backend.exports import packing_list_csv
    items = [_inv("1", "BD Vacutainer Safety-Lok Blood Collection Set 21G x 3/4in", expiration_date=None),
             _inv("2", "Gauze 4x4 sterile"), _inv("3", "Gauze 4x4 latex"), _inv("4", "Nitrile Gloves Medium")]
    req = {"request_id": "R", "org_name": "O", "items": [
        {"item_name": "BD Vacutainer Safety-Lok Blood Collection Set", "category": "", "quantity": 1},
        {"item_name": "Gauze 4x4", "category": "", "quantity": 1},
        {"item_name": "nitrile gloves medium", "category": "", "quantity": 1},
        {"item_name": "Scalpel", "category": "", "quantity": 1}]}
    rows = _rows(packing_list_csv(req, items))
    hdr = rows[0]
    got = [(r[hdr.index("Match")], r[hdr.index("Supply ID")]) for r in rows[1:]]
    assert got == [("Approximate match", "1"), ("Approximate match - candidate", "3"), ("Approximate match - candidate", "2"),  # tied: all listed
                   ("In stock", "4"), ("Not found in stock", "")]
    assert rows[1][hdr.index("Inventory name")].startswith("BD Vacutainer")


def test_warnings_use_approximate_match_but_not_for_ties():
    from backend.exports import add_stock_warnings
    stock = [_inv("1", "Gauze 4x4 sterile pack", qty=8), _inv("2", "Tape roll", qty=2), _inv("3", "Tape strip", qty=2)]
    req = lambda rid, status, name, qty: {"request_id": rid, "status": status, "items": [{"item_name": name, "category": "", "quantity": qty}]}
    reqs = [req("A", "Approved", "Gauze 4x4", 6), req("B", "Under Review", "gauze 4x4 sterile", 6), req("C", "Under Review", "Tape", 5),
            req("D", "Under Review", "Scissors", 1), req("E", "Under Review", "Tape roll", 5)]
    add_stock_warnings(reqs, stock)
    w = {r["request_id"]: r for r in reqs}
    assert w["A"]["warnings"] == []                                      # 6 of 8 fits
    assert w["B"]["warnings"] == [{"item_name": "Gauze 4x4 sterile pack", "committed": 12, "in_stock": 8, "match": "approximate"}]  # A's approximate approval counts
    assert w["C"]["warnings"] == [] and len(w["C"]["candidates"][0]["names"]) == 2  # "Tape" ties: only a note
    assert w["D"]["unmatched"] == ["Scissors"] and w["D"]["warnings"] == []
    assert w["E"]["warnings"][0]["match"] == "exact"

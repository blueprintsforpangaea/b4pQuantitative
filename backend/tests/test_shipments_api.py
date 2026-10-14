"""Ops shipments API against a private database built from the Blueprints_DB schema with SYNTHETIC stock.

Needs the schema file (env B4P_DB_SCHEMA, default ~/b4p-repos/wt-db-back/sql/schema.sql) and a local
Postgres; skipped otherwise. Never touches b4p_v2 or any remote database.
Run from repo root: python -m pytest backend/tests/test_shipments_api.py -v
"""
import os
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import app as appmod

SCHEMA = Path(os.environ.get("B4P_DB_SCHEMA", "~/b4p-repos/wt-db-back/sql/schema.sql")).expanduser()
TPL, DB = "b4p_ship_api_tpl", "b4p_ship_api_test"
H = {"X-Admin-Token": "test-token"}


def _psql(db, sql):
    return subprocess.run(["psql", "-q", "-At", "-v", "ON_ERROR_STOP=1", db, "-c", sql], capture_output=True, text=True, check=True).stdout.strip()


@pytest.fixture(scope="module")
def template():
    if not SCHEMA.exists() or subprocess.run(["psql", "-lqt"], capture_output=True, text=True).returncode != 0:
        pytest.skip("Blueprints_DB schema or local Postgres not available")
    subprocess.run(["dropdb", "--if-exists", "--force", TPL], check=True)
    subprocess.run(["createdb", TPL], check=True)
    subprocess.run(["psql", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(SCHEMA), TPL], capture_output=True, check=True)
    _psql(TPL, "INSERT INTO box (box_type, box_number, pallet_number) VALUES ('ST/N', 7, 2)")
    for i, (name, qty, exp) in enumerate([("Test gloves M", 10, "2031-01-01"), ("Test gloves L", 10, "2026-01-01"), ("Test gauze", 5, None)]):
        _psql(TPL, "INSERT INTO inventory_item (source_key, sheet_row, raw_name, quantity, lot_number, expiration_date, box_id) "
                   f"VALUES ('syn-{i}', {i + 2}, '{name}', {qty}, 'L{i}', {'NULL' if exp is None else repr(exp)}, (SELECT box_id FROM box LIMIT 1))")
    yield TPL
    subprocess.run(["dropdb", "--if-exists", "--force", TPL], check=True)


@pytest.fixture
def client(monkeypatch, template):
    subprocess.run(["dropdb", "--if-exists", "--force", DB], check=True)
    subprocess.run(["createdb", "-T", template, DB], check=True)
    monkeypatch.setenv("DATABASE_URL", f"postgresql:///{DB}")
    monkeypatch.setenv("ADMIN_TOKEN", "test-token")
    monkeypatch.setenv("ITEMS_CACHE_SECONDS", "0")
    appmod.clear_items_cache()
    yield TestClient(appmod.app, headers=H)
    subprocess.run(["dropdb", "--if-exists", "--force", DB], check=True)


def ids(client):
    return {i["name"]: i["id"] for i in client.get("/items").json()}


def make(client, lines, **kw):
    r = client.post("/shipments", json={"name": "Test clinic", **kw, "lines": lines})
    assert r.status_code == 201, r.text
    return r.json()


def test_503_without_database_and_auth_first(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("ADMIN_TOKEN", "test-token")
    c = TestClient(appmod.app)
    assert c.get("/shipments").status_code == 401
    r = c.get("/shipments", headers=H)
    assert r.status_code == 503 and "DATABASE_URL" in r.json()["error"]
    assert c.get("/allocations").status_code == 503
    assert c.post("/shipments", json={"name": "x"}, headers=H).status_code == 503


def test_writes_need_the_admin_token(client):
    anon = TestClient(appmod.app)
    for method, path, body in [("post", "/shipments", {"name": "x"}), ("patch", "/shipments/x", {}), ("put", "/shipments/x/lines", []),
                               ("patch", "/shipments/x/lines/1", {}), ("post", "/shipments/import", {})]:
        assert getattr(anon, method)(path, json=body).status_code == 401, path
        assert getattr(anon, method)(path, json=body, headers={"X-Admin-Token": "bad"}).status_code == 401, path
    assert anon.get("/shipments").status_code == 401
    assert anon.get("/allocations").status_code == 200   # public like /items (reduced, see test_allocations_hide_shipment_names)


def test_create_get_scopes_and_totals(client):
    it = ids(client)
    s = make(client, [{"item_id": it["Test gloves M"], "quantity": 4}, {"item_id": it["Test gloves L"], "quantity": 2}],
             recipient="Clinic A", shipping_method="Plane", blueprints_contact="Alex Example", request_ids=["REQ-1-aa"])
    assert s["stage"] == "planned" and s["request_ids"] == ["REQ-1-aa"] and s["totals"]["line_count"] == 2 and s["totals"]["units"] == 6
    line = next(l for l in s["lines"] if l["name"] == "Test gloves M")
    assert (line["pallet_number"], line["category_box"], line["box_number"], line["on_hand"], line["available"], line["max_quantity"]) == (2, "ST/N", 7, 10, 6, 10)
    assert next(l for l in s["lines"] if l["name"] == "Test gloves L")["expiry_status"] == "expired"
    assert [x["id"] for x in client.get("/shipments?scope=active").json()] == [s["id"]]
    assert client.get("/shipments?scope=past").json() == []
    assert client.get(f"/shipments/{s['id']}").json()["id"] == s["id"]
    assert client.get("/shipments/nope").status_code == 404
    assert client.get("/shipments?scope=bogus").status_code == 422
    assert {(a["shipment_id"], a["quantity"]) for a in client.get("/allocations").json()} == {(s["id"], 4), (s["id"], 2)}
    # without a token only {item_id, stage, quantity}
    for tokenless in (TestClient(appmod.app).get("/allocations"), TestClient(appmod.app).get("/allocations", headers={"X-Admin-Token": "wrong"})):
        assert tokenless.status_code == 200
        assert sorted(tokenless.json(), key=lambda a: a["quantity"]) == sorted(
            [{"item_id": it["Test gloves M"], "stage": "planned", "quantity": 4}, {"item_id": it["Test gloves L"], "stage": "planned", "quantity": 2}],
            key=lambda a: a["quantity"])
    assert "shipment_name" not in TestClient(appmod.app).get("/allocations").text


def test_over_allocation_is_409_with_clear_body(client):
    it = ids(client)
    make(client, [{"item_id": it["Test gauze"], "quantity": 4}])
    r = client.post("/shipments", json={"name": "Two", "lines": [{"item_id": it["Test gauze"], "quantity": 2}]})
    assert r.status_code == 409
    body = r.json()
    assert body["item_id"] == it["Test gauze"] and body["requested"] == 2 and body["available"] == 1 and "only 1 available" in body["error"]
    assert len(client.get("/shipments").json()) == 1


def test_patch_stage_stock_and_past_scope(client):
    it = ids(client)
    s = make(client, [{"item_id": it["Test gauze"], "quantity": 3}])
    r = client.patch(f"/shipments/{s['id']}", json={"stage": "pulling", "shipping_method": "Boat", "blueprints_contact": "Pat"})
    assert r.status_code == 200 and r.json()["stage"] == "pulling" and r.json()["shipping_method"] == "Boat"
    assert client.patch(f"/shipments/{s['id']}", json={"stage": "shipped"}).json()["ship_date"]
    assert next(i for i in client.get("/items").json() if i["id"] == it["Test gauze"])["quantity"] == 2   # cache dropped
    assert client.get("/shipments?scope=active").json() == []
    assert [x["id"] for x in client.get("/shipments?scope=past").json()] == [s["id"]]
    assert client.patch(f"/shipments/{s['id']}", json={"stage": "planned"}).status_code == 409
    assert client.put(f"/shipments/{s['id']}/lines", json=[]).status_code == 409
    assert client.patch("/shipments/nope", json={"notes": "x"}).status_code == 404
    assert client.patch(f"/shipments/{s['id']}", json={"bogus": 1}).status_code == 400
    assert client.patch(f"/shipments/{s['id']}", json={"ship_date": "2026-02-30"}).status_code == 400


def test_put_lines_and_flags(client):
    it = ids(client)
    s = make(client, [{"item_id": it["Test gloves M"], "quantity": 2}])
    lid = s["lines"][0]["id"]
    r = client.patch(f"/shipments/{s['id']}/lines/{lid}", json={"picked": True})
    assert r.status_code == 200 and r.json()["lines"][0]["picked"] is True
    assert client.patch(f"/shipments/{s['id']}/lines/999999", json={"picked": True}).status_code == 404
    r = client.put(f"/shipments/{s['id']}/lines", json=[{"item_id": it["Test gloves M"], "quantity": 9},
                                                         {"description": "Donated crutches", "quantity": 3, "unit_price": 10}])
    assert r.status_code == 200
    lines = {l["name"]: l for l in r.json()["lines"]}
    assert lines["Test gloves M"]["id"] == lid and lines["Test gloves M"]["picked"] is True
    assert lines["Donated crutches"]["item_id"] is None and lines["Donated crutches"]["available"] is None
    assert r.json()["totals"] == {"line_count": 2, "units": 12, "value": 30.0}
    r = client.put(f"/shipments/{s['id']}/lines", json=[{"item_id": it["Test gloves M"], "quantity": 11}])
    assert r.status_code == 409 and r.json()["available"] == 10
    assert client.put(f"/shipments/{s['id']}/lines", json=[{"item_id": "999", "quantity": 1}]).status_code == 404
    assert client.put(f"/shipments/{s['id']}/lines", json=[{"item_id": it["Test gloves M"], "quantity": 0}]).status_code == 400
    assert client.put("/shipments/nope/lines", json=[]).status_code == 404


def test_import_old_localstorage_shipments(client):
    it = ids(client)
    old_active = {"id": "shipment-1", "recipientName": "Shipment A", "shipmentType": "National", "pointOfContact": "Jane Example",
                  "recipientPointOfContact": "Dr X", "notes": "n", "createdAt": "2026-03-02", "isCompleted": False,
                  "transportType": "Plane", "items": [
                      {"id": it["Test gloves M"], "name": "Test gloves M", "quantity": 40, "requestedQuantity": 3, "unitPrice": 0.12, "isConsolidated": True},
                      {"id": "item-gone", "name": "Vanished item", "quantity": 5, "lotNumber": "L9", "expirationDate": "2027-01-31", "isConsolidated": False}]}
    old_done = {"id": "shipment-2", "recipientName": "Shipment B", "shipmentType": "Local", "isCompleted": True, "pastShipmentStatus": "Delivered",
                "shipmentDate": "2026-03-06", "deliveryDate": "2026-03-20", "createdAt": "2026-03-01",
                "items": [{"id": it["Test gauze"], "name": "Test gauze", "quantity": 500}, {"id": "item-9", "name": "Old gloves", "quantity": 40, "unitPrice": 0.5}]}
    over = {"id": "shipment-3", "recipientName": "Too much", "items": [{"id": it["Test gauze"], "name": "Test gauze", "quantity": 99}]}
    non_inv = {"id": "non-inventory-shipment-1", "clinicName": "Walk-in", "pointOfContact": "Sam", "shipmentType": "Local",
               "shippedAt": "2026-02-01", "valuation": 1250.5, "createdAt": "2026-02-01"}
    body = {"shipments": [old_active, old_done, over, {"nope": 1}], "non_inventory": [non_inv, "junk"]}
    r = client.post("/shipments/import", json=body)
    assert r.status_code == 200, r.text
    out = r.json()
    assert (out["created"], out["skipped"]) == (3, 0) and {e["id"] for e in out["errors"]} == {"shipment-3", None}
    by_id = {e["id"]: e for e in out["errors"]}
    assert (by_id["shipment-3"]["code"], by_id["shipment-3"]["index"], by_id["shipment-3"]["source"]) == ("over_allocation", 2, "shipments")
    assert by_id["shipment-3"]["available"] == 5 and by_id["shipment-3"]["requested"] == 99
    assert (by_id[None]["code"] or "") in ("missing_id",)
    assert out["created"] + out["skipped"] + len(out["errors"]) == 6
    got = {s["id"]: s for s in client.get("/shipments").json()}
    a = got["shipment-1"]
    assert (a["stage"], a["shipment_type"], a["blueprints_contact"], a["shipping_method"]) == ("pulling", "International", "Jane Example", "Plane")
    assert "Recipient contact: Dr X" in a["notes"]
    la = {l["name"]: l for l in a["lines"]}
    assert la["Test gloves M"]["quantity"] == 3 and la["Test gloves M"]["consolidated"] is True and la["Test gloves M"]["item_id"] == it["Test gloves M"]
    assert la["Vanished item"]["item_id"] is None and la["Vanished item"]["lot_number"] == "L9" and la["Vanished item"]["expiration_date"] == "2027-01-31"
    b = got["shipment-2"]
    assert (b["stage"], b["ship_date"], b["delivered_date"], b["created_at"][:10]) == ("delivered", "2026-03-06", "2026-03-20", "2026-03-01")
    assert {l["name"]: l["unit_price"] for l in b["lines"]}["Old gloves"] == 0.5
    n = got["non-inventory-shipment-1"]
    assert (n["kind"], n["stage"], n["value"], n["lines"], n["totals"]["value"], n["ship_date"]) == ("non_inventory", "shipped", 1250.5, [], 1250.5, "2026-02-01")
    # history never touched stock; the active one only allocates
    qty = {i["name"]: i["quantity"] for i in client.get("/items").json()}
    assert qty["Test gauze"] == 5 and qty["Test gloves M"] == 10
    # idempotent
    r2 = client.post("/shipments/import", json=body).json()
    assert (r2["created"], r2["skipped"]) == (0, 3)
    assert len(client.get("/shipments").json()) == 3


def test_cors_allows_patch_and_put():
    c = TestClient(appmod.app)
    r = c.options("/shipments/x", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "PATCH",
                                           "Access-Control-Request-Headers": "x-admin-token,content-type"})
    assert r.status_code == 200 and "PATCH" in r.headers["access-control-allow-methods"] and "PUT" in r.headers["access-control-allow-methods"]


def test_stage_steps_back_one_at_a_time(client):
    s = make(client, [])
    sid = s["id"]
    assert client.patch(f"/shipments/{sid}", json={"stage": "consolidated"}).status_code == 200
    assert client.patch(f"/shipments/{sid}", json={"stage": "planned"}).status_code == 409
    assert client.patch(f"/shipments/{sid}", json={"stage": "pulling"}).json()["stage"] == "pulling"
    assert client.patch(f"/shipments/{sid}", json={"stage": "planned"}).json()["stage"] == "planned"


def test_import_reason_never_contains_driver_text(client):
    r = client.post("/shipments/import", json={"shipments": [{"id": "s1", "recipientName": "A", "createdAt": "2026-03-02", "shipmentDate": "not-a-date",
                                                              "isCompleted": True, "items": []}]})
    assert r.status_code == 200
    for e in r.json()["errors"]:
        assert "LINE" not in e["reason"] and "psycopg" not in e["reason"]


def test_non_inventory_shipment_created_directly_and_retry_safe(client):
    it = ids(client)
    body = {"id": "client-1", "name": "Walk-in", "kind": "non_inventory", "stage": "shipped", "ship_date": "2026-02-01", "value": 250}
    r = client.post("/shipments", json=body)
    assert r.status_code == 201 and r.json()["stage"] == "shipped" and r.json()["totals"]["value"] == 250 and r.json()["id"] == "client-1"
    r2 = client.post("/shipments", json=body)                       # retry: same shipment, no duplicate
    assert r2.status_code == 200 and r2.json()["id"] == "client-1"
    assert len(client.get("/shipments").json()) == 1
    qty = {i["name"]: i["quantity"] for i in client.get("/items").json()}
    assert qty["Test gauze"] == 5                                  # no stock effect
    r3 = client.post("/shipments", json={"name": "Inv", "stage": "shipped", "lines": [{"item_id": it["Test gauze"], "quantity": 1}]})
    assert r3.status_code == 400                                   # inventory shipments start planned
    assert client.post("/shipments", json={"id": "bad id!", "name": "x"}).status_code == 422


def test_import_error_text_is_stable_and_has_no_driver_text(client):
    r = client.post("/shipments/import", json={"shipments": [{"id": "s1", "recipientName": "A", "isCompleted": True,
                                                              "shipmentDate": "2026-13-45", "items": []}]})
    out = r.json()
    for e in out["errors"]:
        assert set(e) >= {"index", "code", "message"} and "LINE" not in e["message"] and "date/time" not in e["message"]

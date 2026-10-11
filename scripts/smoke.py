#!/usr/bin/env python3
"""Smoke test: start the backend against a LOCAL database, hit every endpoint, stop the server.

    DATABASE_URL=postgresql:///b4p_v2 .venv/bin/python scripts/smoke.py

Read-only: it never changes a quantity or a status (the status check uses an id that does not exist).
Refuses a DATABASE_URL that points at a remote host.
"""
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = "smoke-test-token"  # throwaway value, only used by this local server


def check_local(url):
    parsed = urlparse(url)
    host = parsed.hostname or ""
    # a host given as a query parameter (postgresql:///db?host=...) would also go to a remote server
    if parsed.scheme not in ("postgresql", "postgres") or host not in ("", "localhost", "127.0.0.1", "::1") or "host" in parsed.query:
        sys.exit(f"refusing to run: DATABASE_URL must be a local Postgres (got host {host!r})")


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def call(base, path, method="GET", token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-Admin-Token"] = token
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.headers, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read().decode()


def main():
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        sys.exit("set DATABASE_URL to a local database, e.g. postgresql:///b4p_v2")
    check_local(url)
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    env = {**os.environ, "ADMIN_TOKEN": TOKEN, "ITEMS_CACHE_SECONDS": "0"}
    for var in ("GOOGLE_SHEETS_CREDENTIALS_PATH", "GOOGLE_SHEETS_CREDENTIALS_JSON"):
        env.pop(var, None)  # never write back to the real sheet
    server = subprocess.Popen([sys.executable, "-m", "uvicorn", "backend.app:app", "--port", str(port), "--log-level", "warning"],
                              cwd=ROOT, env=env)
    failures = []

    def expect(name, ok, detail=""):
        print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail and not ok else ""))
        if not ok:
            failures.append(name)

    try:
        for _ in range(60):
            try:
                if call(base, "/health")[0] == 200:
                    break
            except OSError:
                time.sleep(0.5)
        else:
            sys.exit("server did not start")

        s, h, b = call(base, "/health")
        expect("GET /health reports postgres ok", s == 200 and json.loads(b) == {"source": "postgres", "ok": True}, b)

        s, h, b = call(base, "/items")
        items = json.loads(b) if s == 200 else []
        expect("GET /items", s == 200 and h["X-Data-Source"] == "postgres" and items and {"id", "name", "quantity", "pallet_number"} <= set(items[0]), f"{s}")

        s, h, b = call(base, "/kpis")
        k = json.loads(b) if s == 200 else {}
        expect("GET /kpis matches /items", s == 200 and k.get("total_entries") == len(items) and k.get("total_raw_items") == sum(i["quantity"] for i in items), f"{s} {b[:120]}")

        s, h, b = call(base, "/stock-alerts?soon_days=90&low_stock=1")
        a = json.loads(b) if s == 200 else {}
        expect("GET /stock-alerts", s == 200 and {"expired", "expiring_soon", "low_stock_items", "summary"} <= set(a), f"{s}")
        expect("GET /stock-alerts rejects soon_days=0", call(base, "/stock-alerts?soon_days=0")[0] == 422)

        s, h, b = call(base, "/stock-alerts.csv?soon_days=90")
        expect("GET /stock-alerts.csv", s == 200 and h["Content-Type"].startswith("text/csv") and b.startswith("Status,Supply ID"), f"{s} {b[:60]}")

        s, h, b = call(base, "/sync-status")
        st = json.loads(b) if s == 200 else {}
        expect("GET /sync-status", s == 200 and st.get("source") == "postgres" and "last_success_at" in st, f"{s} {b[:120]}")

        expect("GET /requests without a token is 401", call(base, "/requests")[0] == 401)
        expect("GET /requests with a wrong token is 401", call(base, "/requests", token="wrong")[0] == 401)
        s, h, b = call(base, "/requests", token=TOKEN)
        reqs = json.loads(b).get("requests", []) if s == 200 else []
        expect("GET /requests with the token", s == 200 and "statuses" in json.loads(b), f"{s}")

        if reqs:
            rid = reqs[0]["request_id"]
            s, h, b = call(base, f"/requests/{rid}/packing-list.csv", token=TOKEN)
            expect("GET packing-list.csv", s == 200 and h["Content-Type"].startswith("text/csv") and b.startswith("Request,Organization"), f"{s} {b[:60]}")
            expect("GET packing-list.csv without a token is 401", call(base, f"/requests/{rid}/packing-list.csv")[0] == 401)
        else:
            print("SKIP packing list (no requests in this database)")

        expect("GET packing-list.csv unknown request is 404", call(base, "/requests/REQ-does-not-exist/packing-list.csv", token=TOKEN)[0] == 404)
        expect("POST status without a token is 401", call(base, "/requests/REQ-does-not-exist/status", "POST", body={"status": "Approved"})[0] == 401)
        expect("POST status for an unknown request is 404", call(base, "/requests/REQ-does-not-exist/status", "POST", TOKEN, {"status": "Approved"})[0] == 404)
        expect("POST status with an invalid status is 400", call(base, "/requests/REQ-does-not-exist/status", "POST", TOKEN, {"status": "bogus"})[0] == 400)
    finally:
        server.terminate()
        try:
            server.wait(10)
        except subprocess.TimeoutExpired:
            server.kill()

    print(f"\n{'FAILED: ' + ', '.join(failures) if failures else 'all checks passed'}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()

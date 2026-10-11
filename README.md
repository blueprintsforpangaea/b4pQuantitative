# Inventory Management and Analytics System

This project uses a React/Vite frontend, a FastAPI backend, and Google Sheets as the inventory data source.

## Project structure

```text
backend/       FastAPI application
frontend/      React application
api/           Serverless API entry point
```

The legacy `streamlit_app/` directory is not used and is ignored by Git.

## Run locally

Open two terminals from the repository root.

### Backend

```powershell
cd backend
py -m pip install -r requirements.txt
$env:GOOGLE_SHEETS_CREDENTIALS_PATH = (Resolve-Path ".\credentials.json")
py -m uvicorn app:app --reload
```

The API is available at `http://127.0.0.1:8000` and its interactive documentation is at `http://127.0.0.1:8000/docs`.

### React frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies the React app's `/items` and `/kpis` requests to the local FastAPI server.

For a separately hosted backend, set `VITE_API_BASE` to its public URL before building the frontend.

## Data source

By default the API reads the inventory Google Sheet (public CSV) and writes quantity edits back with gspread. It can instead read from Postgres.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Supabase pooler URLs work). Unset = Google Sheet only. |
| `GOOGLE_SHEETS_CREDENTIALS_PATH` or `GOOGLE_SHEETS_CREDENTIALS_JSON` | Service account for sheet write-back. Optional when using Postgres. |

**Switch to Postgres:** set `DATABASE_URL` (locally in your shell, on Vercel under Project Settings > Environment Variables) and redeploy. **Switch back:** unset it.

With `DATABASE_URL` set:

- `GET /items` reads the `dash_items` view; `GET /kpis` is computed from the same items.
- `POST /items/{id}/quantity` calls `set_item_quantity()` in the database, then also updates the Google Sheet if sheet credentials are configured, so the sheet stays consistent. A failed sheet write is logged as a warning; the database change is kept.
- If the database cannot be reached (5 second timeout), reads and updates return 503 (no silent fallback: the sheet has different rows).
- Sheet write-back goes to the "Final Inventorying" tab (`INVENTORY_WORKSHEET_GID`, default `1019735220`) at the row `set_item_quantity()` returns. It is skipped, with a logged warning, if that row's Image URL no longer matches the item.
- Every `/items` and `/kpis` response has an `X-Data-Source: postgres|sheet` header showing which source served it.
- `GET /health` returns `{"source": "postgres"|"sheet", "ok": true|false}`.

### Security settings

| Variable | Purpose |
| --- | --- |
| `ALLOWED_ORIGINS` | Comma-separated CORS allow-list. Default: `https://b4p-quantitative.vercel.app,http://localhost:5173`. |
| `ADMIN_TOKEN` | Required to edit quantities. `POST /items/{id}/quantity` requires an `X-Admin-Token` header with this value; if it is unset or blank, the endpoint returns 403 (editing disabled). (The dashboard UI has no quantity editor yet; send the header from whatever tool calls this endpoint.) |

Quantities must be between 0 and 999,999.

## Stock alerts and requests (Postgres mode)

- `GET /stock-alerts?soon_days=90&low_stock=1` groups items into expired, expiring soon and low stock (works in both modes).
- `GET /requests` lists requests grouped per request id and `POST /requests/{id}/status` changes one through `set_request_status()` (409 for a disallowed transition, 404 unknown id). Both need `X-Admin-Token` (`ADMIN_TOKEN`) because they include requester emails, and need `DATABASE_URL`. The Requests tab asks for the token and keeps it in sessionStorage only.
- Where a price is 0 the UI shows "Price unknown" instead of $0.
- `dash_items` is cached in memory for 60 seconds (`ITEMS_CACHE_SECONDS`, 0 disables) and dropped after a quantity edit through this API. Locally `/items` went from about 60 ms to about 4 ms on a cache hit and `/kpis` from about 67 ms to about 7 ms; the gain is larger against a remote database. On serverless each instance has its own cache, so data can be up to a minute old.

## Guide for HQ staff

The dashboard has six tabs.

- **Total Inventory:** every supply as a line item, with search and filters. Where a price has not been entered yet it says "Price unknown" rather than $0.
- **Inventory KPIs:** totals (units on hand, expired units, units expiring within 90 days), pallet and box counts, and charts by expiration window, time in the warehouse and category. Items with no pallet or box assigned are not counted as a pallet or box.
- **Stock Alerts:** three lists. Expired and expiring-soon only include items with stock on hand. Low stock lists items at or below the chosen number of units (1 by default). The "Expiring within" and "Low stock" menus change the windows.
- **Requests:** requests from partner organizations. Choose a new status from the menu on a row; only valid moves are offered (Under Review, Approved, Shipped, Delivered, or Denied/Cancelled while still open). Delivered, Cancelled and Denied are final.
- **Shipments** and **Shipment KPIs:** the existing shipment planning and reporting screens.

The header shows when the inventory was last copied from the Google Sheet. If the latest attempt failed it shows the last successful sync and says the latest attempt failed.

Open requests (Under Review or Approved) show an amber note such as "Approving this would commit 12 of 8 in stock" when the quantity already approved for that item on other requests, plus this one, is more than what is in stock (names matched as in the packing list). A line whose name matches no inventory item at all gets a neutral "Not matched to any inventory item; check the name" note instead. It is only a warning: it never blocks a status change, and inventory is not reduced when a request is Shipped.

### CSV exports

- **Stock Alerts > Download expiring CSV:** expired items plus items expiring within the selected window, with location (pallet, box category, box number).
- **Requests > CSV (per request):** a packing list. Each requested item is matched by name (ignoring case, extra spaces and a trailing "[Lot ..., Box ..., Pallet ...]" that the partner site adds) to items in stock. Rows that match the most of the requested lot, box and pallet come first, then the earliest expiration, with pallet, box and lot numbers. Items that are not found in stock are marked as such, so check those by hand. Requested names are typed by partners, so a spelling that differs by more than case and spacing will not match.

### Admin token setup (Requests tab and its CSVs)

The Requests tab shows requester emails and can change request status, so it is locked. The server operator sets an environment variable named `ADMIN_TOKEN` on the backend (locally in the shell, on Vercel under Project Settings > Environment Variables) and shares the token with HQ staff privately. Staff type it once into the Requests tab; it is kept only for that browser session. Without `ADMIN_TOKEN` the Requests tab reports that it is disabled. The Requests tab also needs `DATABASE_URL` (the database connection) to be set. Never put the token's value in the repository.

## Frontend tests

`cd frontend && npm test` runs the component tests (vitest, jsdom, Testing Library) for the Stock Alerts, Requests and header sync cell: loading, empty, error and data states and the "Price unknown" logic. Backend tests: `python -m pytest backend/tests`.

## Smoke test

`DATABASE_URL=postgresql:///b4p_v2 .venv/bin/python scripts/smoke.py` starts the backend on a free port against that local database (it refuses any remote host), calls every endpoint (items, kpis, stock-alerts, both CSVs, sync-status, requests with and without the admin token, and 401/404/400 status cases), prints PASS/FAIL per check, stops the server and exits non-zero on any failure. It is read-only and never writes to the Google Sheet.

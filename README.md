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

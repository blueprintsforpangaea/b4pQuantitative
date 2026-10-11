from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import requests
import csv
import re
import os
import hmac
import time
import json
import logging
from io import StringIO

try:
    import gspread
    from google.oauth2.service_account import Credentials
except ImportError:  # pragma: no cover - optional until credentials are configured
    gspread = None
    Credentials = None

try:
    from . import db
    from .alerts import build_alerts
    from .exports import add_stock_warnings, expiring_csv, packing_list_csv
except ImportError:  # run as `uvicorn app:app` from inside backend/
    import db
    from alerts import build_alerts
    from exports import add_stock_warnings, expiring_csv, packing_list_csv

logger = logging.getLogger(__name__)

app = FastAPI(title="Inventory Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        o.strip()
        for o in os.getenv("ALLOWED_ORIGINS", "https://b4p-quantitative.vercel.app,http://localhost:5173").split(",")
        if o.strip()
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Admin-Token"],
)

# ==============================
# GOOGLE SHEET CONFIG
# ==============================
SHEET_ID = "1OiT1QBBnlazfRCv0MgwE_LXvIVJNAVQha1Ez7M4Vc88"
SHEET_GID = "384285232"
SHEET_URL = (
    f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export"
    f"?format=csv&gid={SHEET_GID}"
)

APPROVED_CATEGORIES = {
    "Airway & Oxygen",
    "Catheters & Briefs",
    "Gloves",
    "IV Supplies",
    "Masks & Face Shields",
    "Needles & Syringes",
    "Sutures",
    "Wound Care & Bandages",
    "Vitals & Home Health",
    "Apparel (Gowns, Shoe Covers, etc.)",
    "Misc Surgical",
    "Misc Non-Medical",
}

CATEGORY_ALIASES = {
    "misc non‐medical": "Misc Non-Medical",
    "misc non-medical": "Misc Non-Medical",
    "misc non‑medical": "Misc Non-Medical",
    "misc non–medical": "Misc Non-Medical",
    "misc non—medical": "Misc Non-Medical",
    "unspecified": "Misc Non-Medical",
    "uncategorized": "Misc Non-Medical",
    "medical supplies": "Misc Non-Medical",
    "": "Misc Non-Medical",
}



# ==============================
# DATA MODELS
# ==============================
class Item(BaseModel):
    id: str
    name: str
    gen_name: str
    category: str
    manufacturer: str
    review_status: Optional[str] = None
    days_in_warehouse: int = 0
    image_url: Optional[str] = None
    
    quantity: int
    unit_value: float
    total_value: float
    
    expiration_date: Optional[str] = None
    warehouse_date: str

    pallet_number: int
    category_box: str
    box_number: int

    @field_validator("image_url")
    @classmethod
    def only_web_links(cls, value):
        """Photo links end up in an href; anything but http(s) (e.g. javascript:) is dropped."""
        if value and not re.match(r"^https?://", value.strip(), re.IGNORECASE):
            return None
        return value


class KPIResponse(BaseModel):
    total_entries: int
    total_raw_items: int
    total_value: float
    avg_value_per_item: float
    avg_duration_per_item: float
    pallet_count: int
    box_count: int
    expiry_ranges: Dict[str, Dict[str, float]]
    duration_ranges: Dict[str, Dict[str, float]]
    expiry_ranges_category_breakdown: Dict[str, Dict]
    duration_ranges_category_breakdown: Dict[str, Dict]
    category_kpis: Dict[str, Dict]
    top_supplies_table: Dict[str, Dict]
    weekly_productivity_kpis: Dict[str, Dict]
    pallet_kpis: Dict[str, Dict]


class QuantityUpdateRequest(BaseModel):
    quantity: int = Field(ge=0, lt=1_000_000)


class QuantityUpdateResponse(BaseModel):
    item_id: str
    quantity: int
    total_value: float


def parse_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    text = str(value).strip()
    if not text:
        return default
    match = re.search(r"-?\d+", text.replace(",", ""))
    return int(match.group()) if match else default


def parse_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    text = str(value).strip().replace(",", "")
    if not text:
        return default
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    return float(match.group()) if match else default


def normalize_expiration_date(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return None

    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue

    return None


def read_category(row: Dict[str, Any]) -> Any:
    """Return the raw category cell, tolerating the sheet's column renames.

    The live tab labels the approved-category column "Subcategories"; older tabs
    used "Category"/"Subcategory". Pick the first one that has a value.
    """
    for header in ("Subcategories", "Subcategory", "Category"):
        value = str(row.get(header) or "").strip()
        if value:
            return value

    return ""


def normalize_category(value: Any) -> str:
    raw = str(value or "").strip()
    if raw in APPROVED_CATEGORIES:
        return raw

    alias_key = (
        raw.lower()
        .replace("â\x80\x90", "-")
        .replace("‐", "-")
        .replace("‑", "-")
        .replace("–", "-")
        .replace("—", "-")
    )
    normalized = CATEGORY_ALIASES.get(alias_key)
    if normalized:
        return normalized

    return raw or "Misc Non-Medical"


def normalize_item_id(row: Dict[str, Any], fallback_index: int) -> str:
    candidate_headers = [
        "Supply ID",
        "Supply Id",
        "Supply Ud",
        "SupplyUD",
        "ID",
        "Id",
        "SupplyId",
        "Unique ID",
        "Item ID",
        "",
    ]

    for header in candidate_headers:
        value = str(row.get(header) or "").strip()
        if value:
            return value

    return str(fallback_index)


def get_gspread_worksheet(gid: str = SHEET_GID):
    if gspread is None or Credentials is None:
        raise HTTPException(
            status_code=503,
            detail="Google Sheets write support is not installed on the backend yet.",
        )

    credentials_path = os.getenv("GOOGLE_SHEETS_CREDENTIALS_PATH")
    credentials_json = os.getenv("GOOGLE_SHEETS_CREDENTIALS_JSON")
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]

    try:
        if credentials_json:
            info = json.loads(credentials_json)
            credentials = Credentials.from_service_account_info(info, scopes=scopes)
        elif credentials_path:
            credentials = Credentials.from_service_account_file(credentials_path, scopes=scopes)
        else:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Google Sheets credentials are not configured. Set "
                    "GOOGLE_SHEETS_CREDENTIALS_PATH or GOOGLE_SHEETS_CREDENTIALS_JSON."
                ),
            )

        client = gspread.authorize(credentials)
        spreadsheet = client.open_by_key(SHEET_ID)
        try:
            return spreadsheet.get_worksheet_by_id(int(gid))
        except AttributeError:
            for worksheet in spreadsheet.worksheets():
                if str(worksheet.id) == str(gid):
                    return worksheet
            raise HTTPException(status_code=500, detail="Configured worksheet could not be found.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Unable to connect to Google Sheets: {exc}") from exc


def update_sheet_quantity(item_id: str, quantity: int) -> QuantityUpdateResponse:
    if quantity < 0:
        raise HTTPException(status_code=400, detail="Quantity cannot be negative.")

    worksheet = get_gspread_worksheet()
    records = worksheet.get_all_records()
    headers = worksheet.row_values(1)

    supply_id_column = None
    quantity_column = None
    total_price_column = None
    unit_price_column = None

    for index, header in enumerate(headers, start=1):
        normalized = str(header or "").strip().lower()
        if normalized == "supply id":
            supply_id_column = index
        elif normalized == "quantity":
            quantity_column = index
        elif normalized == "total price":
            total_price_column = index
        elif normalized == "price per unit":
            unit_price_column = index

    if not supply_id_column or not quantity_column:
        raise HTTPException(
            status_code=500,
            detail="Required Google Sheet columns (Supply ID, Quantity) were not found.",
        )

    row_number = None
    unit_value = 0.0
    for index, row in enumerate(records, start=2):
        if str(row.get("Supply ID") or "").strip() == str(item_id).strip():
            row_number = index
            unit_value = parse_float(row.get("Price per unit"), 0.0)
            break

    if row_number is None:
        raise HTTPException(status_code=404, detail=f"Supply ID {item_id} was not found in the sheet.")

    updates = [
        {
            "range": gspread.utils.rowcol_to_a1(row_number, quantity_column),
            "values": [[quantity]],
        }
    ]

    total_value = round(unit_value * quantity, 2)
    if total_price_column:
        updates.append(
            {
                "range": gspread.utils.rowcol_to_a1(row_number, total_price_column),
                "values": [[total_value]],
            }
        )

    worksheet.batch_update(updates, value_input_option="USER_ENTERED")
    return QuantityUpdateResponse(item_id=item_id, quantity=quantity, total_value=total_value)


# ==============================
# FETCH DATA FROM GOOGLE SHEETS
# ==============================
def fetch_items_from_sheet() -> List[Item]:
    try:
        response = requests.get(SHEET_URL, timeout=15)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Unable to load Google Sheet: {exc}") from exc

    csv_data = StringIO(response.text)
    reader = csv.DictReader(csv_data)
    today = datetime.now().date()

    items = []
    for index, row in enumerate(reader, start=1):
        try:
            name = (row.get("Name") or "").strip()
            manufacturer = (row.get("Manufacturer Name") or "").strip()
            category = normalize_category(read_category(row))

            if not any([name, manufacturer, category]):
                continue

            days_in_warehouse = parse_int(row.get("Days in Warehouse"))
            warehouse_date = (today - timedelta(days=days_in_warehouse)).isoformat()
            quantity = parse_int(row.get("Quantity"))
            unit_value = parse_float(row.get("Price per unit"), parse_float(row.get("Unit Value")))
            total_value = parse_float(row.get("Total Price"), parse_float(row.get("Total Value"), quantity * unit_value))

            item = Item(
                id=normalize_item_id(row, index),
                name=name or f"Item {index}",
                gen_name=(row.get("General") or "").strip(),
                category=category,
                manufacturer=manufacturer or "Unknown",
                review_status=(row.get("Review") or "").strip() or None,
                days_in_warehouse=days_in_warehouse,
                image_url=(row.get("Image URL") or "").strip() or None,
                quantity=quantity,
                unit_value=unit_value,
                total_value=total_value,
                expiration_date=normalize_expiration_date(row.get("Date of Expiration")),
                warehouse_date=warehouse_date,
                pallet_number=parse_int(row.get("Pallet Number"), default=0),
                category_box=(row.get("Box Category") or "").strip() or "Unassigned",
                box_number=parse_int(row.get("Box Number"), default=0),
            )
            items.append(item)
        except Exception as e:
            print(f"Error parsing row: {row} -> {e}")

    return items


_items_cache: Dict[str, Any] = {"at": 0.0, "dsn": None, "items": None}


def clear_items_cache() -> None:
    _items_cache.update(at=0.0, dsn=None, items=None)


def fetch_items_from_db() -> List[Item]:
    """dash_items as Items, cached for ITEMS_CACHE_SECONDS (default 60; 0 disables).

    The cache is per process and dropped after a quantity edit made through this API, so other
    server instances (or the sheet sync) can show data up to that many seconds old.
    """
    ttl = float(os.getenv("ITEMS_CACHE_SECONDS", "60"))
    now = time.monotonic()
    dsn = os.getenv("DATABASE_URL")
    if ttl > 0 and _items_cache["items"] is not None and _items_cache["dsn"] == dsn and now - _items_cache["at"] < ttl:
        return _items_cache["items"]
    items = [Item(**{k: v for k, v in row.items() if k != "sheet_row"}) for row in db.fetch_items()]
    if ttl > 0:
        _items_cache.update(at=now, dsn=dsn, items=items)
    return items


def load_items(response: Response) -> List[Item]:
    """Postgres if DATABASE_URL is set (503 if it is down), else the sheet.

    The source that served the request is reported in the X-Data-Source header.
    """
    if db.enabled():
        try:
            items = fetch_items_from_db()
        except db.Error as exc:
            logger.error("Postgres read failed: %s", exc)
            raise HTTPException(status_code=503, detail="Database unavailable.") from exc
        response.headers["X-Data-Source"] = "postgres"
        return items
    response.headers["X-Data-Source"] = "sheet"
    return fetch_items_from_sheet()


def sheet_write_configured() -> bool:
    return bool(os.getenv("GOOGLE_SHEETS_CREDENTIALS_PATH") or os.getenv("GOOGLE_SHEETS_CREDENTIALS_JSON"))


# ==============================
# ROUTES
# ==============================
@app.get("/")
def root():
    return {"message": "Inventory API is running"}


@app.get("/health")
def health():
    if not db.enabled():
        return {"source": "sheet", "ok": True}
    try:
        db.ping()
        return {"source": "postgres", "ok": True}
    except db.Error:
        return {"source": "postgres", "ok": False}


@app.get("/items", response_model=List[Item])
def get_items(response: Response):
    return load_items(response)


@app.get("/stock-alerts")
def stock_alerts(
    response: Response,
    soon_days: int = Query(90, ge=1, le=3650),
    low_stock: int = Query(3, ge=0, le=1_000_000),
):
    return build_alerts(load_items(response), soon_days=soon_days, low_stock=low_stock)


@app.get("/stock-alerts.csv")
def stock_alerts_csv(response: Response, soon_days: int = Query(90, ge=1, le=3650)):
    body = expiring_csv(build_alerts(load_items(response), soon_days=soon_days))
    return Response(body, media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="expiring-within-{soon_days}-days.csv"',
        "X-Data-Source": response.headers.get("X-Data-Source", ""),
    })


@app.get("/sync-status")
def sync_status():
    """When the inventory was last copied from the sheet (database mode only)."""
    if not db.enabled():
        return {"source": "sheet"}
    try:
        row = db.fetch_sync_status()
    except db.Error as exc:
        logger.error("Postgres read of sync status failed: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable.") from exc
    iso = lambda v: v.isoformat() if v else None
    return {
        "source": "postgres",
        "last_success_at": iso(row["last_success_at"]),
        "last_run_at": iso(row["last_run_at"]),
        # last_run_refused (sync refused by its safety rails) may not exist in older views: treat refused as not ok
        "last_run_ok": None if row["last_run_ok"] is None else bool(row["last_run_ok"]) and not row.get("last_run_refused"),
        "last_run_refused": bool(row.get("last_run_refused")),
        "last_warning_count": row["last_warning_count"],
        "active_items": row["active_items"],
    }


@app.get("/kpis", response_model=KPIResponse)
def calculate_kpis(response: Response):
    items_db = load_items(response)

    # ==============================
    # BASIC KPIS
    # ==============================
    total = len(items_db)
    total_quantity = sum(i.quantity for i in items_db)
    value = sum(i.total_value for i in items_db)
    avg_value = value / total_quantity if total_quantity > 0 else 0

    today = datetime.now()
    items_with_dates = [i for i in items_db if i.warehouse_date]

    if items_with_dates:
        durations = [(today - datetime.fromisoformat(i.warehouse_date)).days for i in items_with_dates]
        avg_duration = sum(durations) / len(durations)
    else:
        avg_duration = 0.0

    # Items without a known pallet/box (0 or 'Unassigned') are not a pallet or box of their own.
    pallets = len(set(i.pallet_number for i in items_db if i.pallet_number > 0))
    boxes = len(set((i.pallet_number, i.category_box, i.box_number)
                    for i in items_db if i.box_number > 0 and i.category_box != "Unassigned"))

    # ==============================
    # EXPIRY CALCULATIONS
    # ==============================
    def in_range(i, start, end):
        return i.expiration_date and start < datetime.fromisoformat(i.expiration_date) <= end

    expires_0_90 = sum(1 for i in items_db if in_range(i, today, today + timedelta(days=90)))
    expires_0_90_qty = sum(i.quantity for i in items_db if in_range(i, today, today + timedelta(days=90)))
    expires_0_90_value = sum(i.total_value for i in items_db if in_range(i, today, today + timedelta(days=90)))

    expires_90_180 = sum(1 for i in items_db if in_range(i, today + timedelta(days=90), today + timedelta(days=180)))
    expires_90_180_qty = sum(i.quantity for i in items_db if in_range(i, today + timedelta(days=90), today + timedelta(days=180)))
    expires_90_180_value = sum(i.total_value for i in items_db if in_range(i, today + timedelta(days=90), today + timedelta(days=180)))

    expires_180_365 = sum(1 for i in items_db if in_range(i, today + timedelta(days=180), today + timedelta(days=365)))
    expires_180_365_qty = sum(i.quantity for i in items_db if in_range(i, today + timedelta(days=180), today + timedelta(days=365)))
    expires_180_365_value = sum(i.total_value for i in items_db if in_range(i, today + timedelta(days=180), today + timedelta(days=365)))

    expires_365_plus = sum(1 for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) > today + timedelta(days=365))
    expires_365_plus_qty = sum(i.quantity for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) > today + timedelta(days=365))
    expires_365_plus_value = sum(i.total_value for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) > today + timedelta(days=365))

    already_expired = sum(1 for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) <= today)
    already_expired_qty = sum(i.quantity for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) <= today)
    already_expired_value = sum(i.total_value for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) <= today)

    no_expiration = sum(1 for i in items_db if not i.expiration_date)
    no_expiration_qty = sum(i.quantity for i in items_db if not i.expiration_date)
    no_expiration_value = sum(i.total_value for i in items_db if not i.expiration_date)

    expiry_ranges_table = {}
    if total_quantity > 0:
        expiry_ranges_table = {
            "Already Expired": {"entries": already_expired, "raw_items": already_expired_qty, "value": already_expired_value},
            "0-90 days": {"entries": expires_0_90, "raw_items": expires_0_90_qty, "value": expires_0_90_value},
            "90-180 days": {"entries": expires_90_180, "raw_items": expires_90_180_qty, "value": expires_90_180_value},
            "180-365 days": {"entries": expires_180_365, "raw_items": expires_180_365_qty, "value": expires_180_365_value},
            "365+ days": {"entries": expires_365_plus, "raw_items": expires_365_plus_qty, "value": expires_365_plus_value},
            "No expiration": {"entries": no_expiration, "raw_items": no_expiration_qty, "value": no_expiration_value},
        }

    # ==============================
    # RETURN (minimal working version)
    # ==============================
    return KPIResponse(
        total_entries=total,
        total_raw_items=total_quantity,
        total_value=round(value, 2),
        avg_value_per_item=round(avg_value, 2),
        avg_duration_per_item=round(avg_duration, 2),
        pallet_count=pallets,
        box_count=boxes,
        expiry_ranges=expiry_ranges_table,
        duration_ranges={},
        expiry_ranges_category_breakdown={},
        duration_ranges_category_breakdown={},
        category_kpis={},
        top_supplies_table={},
        weekly_productivity_kpis={},
        pallet_kpis={}
    )


def write_back_to_inventory_tab(row: Dict[str, Any], quantity: int) -> None:
    """Mirror a DB quantity edit into the sheet row it came from (best effort, never raises)."""
    try:
        gid = os.getenv("INVENTORY_WORKSHEET_GID", "1019735220")
        worksheet = get_gspread_worksheet(gid)
        headers = [str(h or "").strip().lower() for h in worksheet.row_values(1)]
        cells = worksheet.row_values(row["sheet_row"])
        cell = lambda name: cells[headers.index(name)] if name in headers and headers.index(name) < len(cells) else ""
        # Rows may have shifted since the last sync: only write if this is the same product.
        image = (row["image_url"] or "").strip()
        same_name = cell("name").strip().lower() == (row["name"] or "").strip().lower()
        if not image or cell("image url").strip() != image or not same_name:
            logger.warning("Sheet row %s does not match item %s (blank/different image URL or name); skipped write-back.", row["sheet_row"], row["id"])
            return
        if "quantity" not in headers:
            logger.warning("Sheet tab has no Quantity column; skipped write-back.")
            return
        worksheet.update_cell(row["sheet_row"], headers.index("quantity") + 1, quantity)
    except Exception as exc:  # DB change is already saved; the sheet is best effort
        logger.warning("Saved to Postgres but Google Sheet write-back failed: %s", getattr(exc, "detail", exc))


def update_quantity_in_db(item_id: str, quantity: int) -> QuantityUpdateResponse:
    try:
        row = db.set_quantity(item_id, quantity)
        clear_items_cache()
    except db.OperationalError as exc:
        logger.error("Postgres unavailable on quantity update: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable.") from exc
    except db.NoDataFound as exc:
        raise HTTPException(status_code=404, detail=f"Item {item_id} was not found.") from exc
    except db.Error as exc:
        logger.warning("Postgres rejected quantity update for %s: %s", item_id, exc)
        raise HTTPException(status_code=400, detail="Invalid quantity.") from exc
    if row is None:
        raise HTTPException(status_code=404, detail=f"Item {item_id} was not found.")

    if sheet_write_configured():
        write_back_to_inventory_tab(row, quantity)

    return QuantityUpdateResponse(item_id=row["id"], quantity=row["quantity"], total_value=row["total_value"])


def require_admin(x_admin_token: Optional[str] = Header(None)):
    token = (os.getenv("ADMIN_TOKEN") or "").strip()
    if not token:
        raise HTTPException(status_code=403, detail="Quantity editing is disabled (ADMIN_TOKEN not set).")
    if not hmac.compare_digest((x_admin_token or "").encode(), token.encode()):
        raise HTTPException(status_code=401, detail="Admin token required.")


@app.post("/items/{item_id}/quantity", response_model=QuantityUpdateResponse, dependencies=[Depends(require_admin)])
def update_item_quantity(item_id: str, payload: QuantityUpdateRequest):
    if db.enabled():
        return update_quantity_in_db(item_id, payload.quantity)
    return update_sheet_quantity(item_id=item_id, quantity=payload.quantity)


# ==============================
# REQUESTS (database mode only)
# ==============================
REQUEST_STATUSES = ["Under Review", "Approved", "Shipped", "Delivered", "Cancelled", "Denied"]


class RequestStatusUpdate(BaseModel):
    status: str = Field(max_length=40)


def group_request_lines(lines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Fold dash_requests lines into one entry per request, newest first."""
    grouped: Dict[str, Dict[str, Any]] = {}
    for line in lines:
        req = grouped.setdefault(line["Request ID"], {
            "request_id": line["Request ID"], "org_name": line["Org Name"], "org_email": line["Org Email"],
            "status": line["Status"], "timestamp": line["Timestamp"], "review_flag": False, "items": [],
        })
        req["review_flag"] = req["review_flag"] or line["Review Flag"] == "TRUE"
        req["items"].append({"item_name": line["Item Name"], "category": line["Category"],
                             "quantity": parse_int(line["Quantity Requested"])})
    return sorted(grouped.values(), key=lambda r: r["timestamp"], reverse=True)


def require_db():
    if not db.enabled():
        raise HTTPException(status_code=503, detail="Requests need the database (DATABASE_URL is not set).")


@app.get("/requests", dependencies=[Depends(require_admin), Depends(require_db)])
def list_requests(response: Response):
    try:
        requests_ = group_request_lines(db.fetch_request_lines())
        add_stock_warnings(requests_, load_items(response))
        return {"statuses": REQUEST_STATUSES, "requests": requests_}
    except db.Error as exc:
        logger.error("Postgres read of requests failed: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable.") from exc


@app.get("/requests/{request_id}/packing-list.csv", dependencies=[Depends(require_admin), Depends(require_db)])
def request_packing_list(request_id: str, response: Response):
    try:
        requests_ = group_request_lines(db.fetch_request_lines())
    except db.Error as exc:
        logger.error("Postgres read of requests failed: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable.") from exc
    request = next((r for r in requests_ if r["request_id"] == request_id), None)
    if request is None:
        raise HTTPException(status_code=404, detail=f"Request {request_id} was not found.")
    body = packing_list_csv(request, load_items(response))
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "", request_id)
    return Response(body, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="packing-list-{safe_id}.csv"'})


@app.post("/requests/{request_id}/status", dependencies=[Depends(require_admin), Depends(require_db)])
def update_request_status(request_id: str, payload: RequestStatusUpdate):
    try:
        found, status = db.set_request_status(request_id, payload.status)
        clear_items_cache()  # any write through this API starts the next read from the database
    except db.OperationalError as exc:
        logger.error("Postgres unavailable on request status update: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable.") from exc
    except db.Error as exc:
        msg = str(exc)
        if "cannot change request" in msg:
            raise HTTPException(status_code=409, detail=msg.splitlines()[0].replace("ERROR:  ", "")) from exc
        logger.warning("Postgres rejected request status update: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid status.") from exc
    if not found:
        raise HTTPException(status_code=404, detail=f"Request {request_id} was not found.")
    return {"request_id": request_id, "status": status}

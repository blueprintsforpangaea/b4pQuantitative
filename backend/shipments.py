"""Ops shipments API (database mode only). Schema and rules: Blueprints_DB docs/CONTRACT.md, "Ops shipments"."""
import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

try:
    from . import db
except ImportError:  # run as a script from backend/
    import db

logger = logging.getLogger("uvicorn.error")

HEADER_FIELDS = ("name", "recipient", "shipment_type", "shipping_method", "blueprints_contact", "ship_date",
                 "delivered_date", "request_ids", "notes", "kind", "unit_count", "value")


def error(status: int, message: str, **extra: Any) -> JSONResponse:
    """{error: message, detail: message, ...}; `detail` keeps the shape of the other endpoints' errors."""
    return JSONResponse({"error": message, "detail": message, **extra}, status_code=status)


def db_error(exc: Exception) -> JSONResponse:
    """Map a database error to a response. Messages of our own RAISE statements are user-friendly; others are not leaked."""
    if isinstance(exc, db.OperationalError):
        logger.error("Postgres unavailable on shipments: %s", exc)
        return error(503, "Database unavailable.")
    diag = getattr(exc, "diag", None)
    message = ((diag.message_primary if diag else None) or "").strip()
    if isinstance(exc, db.CheckViolation):
        extra: Dict[str, Any] = {}
        try:
            extra = json.loads(diag.message_detail or "{}")
        except ValueError:
            pass
        return error(409, message or "Not enough stock.", **extra)
    if isinstance(exc, db.NoDataFound):
        return error(404, message or "Not found.")
    if isinstance(exc, db.psycopg.errors.RaiseException):
        return error(409 if message.startswith("cannot change") else 400, message or "Invalid shipment data.")
    logger.warning("Postgres rejected a shipments request: %s", exc)
    if isinstance(exc, db.psycopg.errors.UndefinedTable) or isinstance(exc, db.psycopg.errors.UndefinedFunction):
        return error(503, "Shipments are not set up in the database yet (the migration has not been applied).")
    return error(400, "Invalid shipment data.")


class ShipmentCreate(BaseModel):
    name: str = Field(max_length=200)
    recipient: Optional[str] = None
    shipment_type: Optional[str] = None
    shipping_method: Optional[str] = None
    blueprints_contact: Optional[str] = None
    ship_date: Optional[str] = None
    request_ids: Optional[List[str]] = Field(default=None, max_length=50)
    notes: Optional[str] = None
    kind: Optional[str] = None
    unit_count: Optional[int] = None
    value: Optional[float] = None
    lines: List[Dict[str, Any]] = Field(default_factory=list, max_length=500)


class LineFlags(BaseModel):
    picked: Optional[bool] = None
    consolidated: Optional[bool] = None


class ImportBody(BaseModel):
    shipments: List[Any] = Field(default_factory=list, max_length=2000)
    non_inventory: List[Any] = Field(default_factory=list, max_length=2000)


# ---- old localStorage objects -> create_shipment arguments ----
def _s(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _num(value: Any) -> Optional[float]:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0 else None


def old_stage(old: Dict[str, Any], items: List[Dict[str, Any]]) -> str:
    if old.get("isCompleted"):
        return "delivered" if _s(old.get("pastShipmentStatus")).lower() == "delivered" else "shipped"
    flags = [bool(i.get("isConsolidated")) for i in items]
    if flags and all(flags):
        return "consolidated"
    return "pulling" if any(flags) else "planned"


def plan_old_shipment(old: Any) -> Dict[str, Any]:
    """{id, header, lines} for one old `blueprints-current-shipments` entry; raises ValueError if unusable."""
    if not isinstance(old, dict) or not _s(old.get("id")):
        raise ValueError("missing id")
    name = _s(old.get("recipientName")) or "Untitled shipment"
    items = [i for i in old.get("items") or [] if isinstance(i, dict)]
    stype = _s(old.get("shipmentType"))
    notes = _s(old.get("notes"))
    if _s(old.get("recipientPointOfContact")):
        notes = (notes + "\n" if notes else "") + "Recipient contact: " + _s(old.get("recipientPointOfContact"))
    header = {"name": name, "recipient": name, "shipment_type": "International" if stype == "National" else stype,
              "shipping_method": _s(old.get("transportType")), "blueprints_contact": _s(old.get("pointOfContact")),
              "notes": notes, "stage": old_stage(old, items), "ship_date": _s(old.get("shipmentDate")) or None,
              "delivered_date": _s(old.get("deliveryDate")) or None, "created_at": _s(old.get("createdAt"))}
    merged: Dict[str, Dict[str, Any]] = {}
    lines: List[Dict[str, Any]] = []
    for it in items:
        qty = it.get("requestedQuantity", it.get("quantity"))
        if not isinstance(qty, (int, float)) or isinstance(qty, bool) or qty < 1 or qty != int(qty):
            qty = it.get("quantity")
        if not isinstance(qty, (int, float)) or isinstance(qty, bool) or qty < 1 or qty != int(qty):
            continue
        line = {"item_id": _s(str(it.get("id", ""))) or None, "name": _s(it.get("name")) or "Item",
                "quantity": int(qty), "picked": bool(it.get("isConsolidated")), "consolidated": bool(it.get("isConsolidated")),
                "lot_number": _s(it.get("lotNumber")) or None, "expiration_date": _s(it.get("expirationDate")) or None}
        price = _num(it.get("unitPrice"))
        if price is not None:
            line["unit_price"] = price
        key = line["item_id"]
        if key and key in merged:   # the same item twice: one line
            merged[key]["quantity"] += line["quantity"]
            continue
        if key:
            merged[key] = line
        lines.append(line)
    return {"id": _s(old["id"]), "header": header, "lines": lines}


def plan_non_inventory(old: Any) -> Dict[str, Any]:
    if not isinstance(old, dict) or not _s(old.get("id")):
        raise ValueError("missing id")
    name = _s(old.get("clinicName")) or "Non-inventory shipment"
    notes = " ".join(x for x in (_s(old.get("notes")), _s(old.get("location"))) if x)
    header = {"name": name, "recipient": name, "shipment_type": _s(old.get("shipmentType")),
              "blueprints_contact": _s(old.get("pointOfContact")), "ship_date": _s(old.get("shippedAt")) or None,
              "created_at": _s(old.get("createdAt")), "kind": "non_inventory", "stage": "shipped", "notes": notes,
              "value": _num(old.get("valuation"))}
    count = old.get("itemCount")
    if isinstance(count, int) and not isinstance(count, bool) and count >= 0:
        header["unit_count"] = count
    return {"id": _s(old["id"]), "header": header, "lines": []}


class ShipmentsUnavailable(Exception):
    """DATABASE_URL is not set."""


def require_shipments_db():
    if not db.enabled():
        raise ShipmentsUnavailable()


def install(app, require_admin, clear_items_cache) -> None:
    """Add the shipments routes and the 503 {error} response for 'no database' to the FastAPI app."""
    async def unavailable(request, exc):
        return error(503, "Shipments need the database (DATABASE_URL is not set).")

    app.add_exception_handler(ShipmentsUnavailable, unavailable)
    app.include_router(build_router(require_admin, require_shipments_db, clear_items_cache))


def build_router(require_admin, require_db, clear_items_cache) -> APIRouter:
    router = APIRouter()
    admin = [Depends(require_admin), Depends(require_db)]

    def shipment_response(shipment_id: str, status: int = 200):
        found = db.fetch_shipments(shipment_id=shipment_id)
        if not found:
            return error(404, f"Shipment {shipment_id} was not found.")
        return JSONResponse(found[0], status_code=status)

    @router.get("/shipments", dependencies=admin)
    def list_shipments(scope: str = Query("all", pattern="^(active|past|all)$")):
        try:
            return db.fetch_shipments(scope)
        except db.Error as exc:
            return db_error(exc)

    @router.get("/shipments/{shipment_id}", dependencies=admin)
    def get_shipment(shipment_id: str):
        try:
            return shipment_response(shipment_id)
        except db.Error as exc:
            return db_error(exc)

    @router.post("/shipments", dependencies=admin)
    def create_shipment(payload: ShipmentCreate):
        header = payload.model_dump(exclude_unset=True, exclude={"lines"})
        try:
            sid = db.create_shipment(header, payload.lines)
            clear_items_cache()
            return shipment_response(sid, 201)
        except db.Error as exc:
            return db_error(exc)

    @router.patch("/shipments/{shipment_id}", dependencies=admin)
    def patch_shipment(shipment_id: str, patch: Dict[str, Any]):
        bad = sorted(set(patch) - set(HEADER_FIELDS) - {"stage"})
        if bad:
            return error(400, "Unknown shipment field: " + ", ".join(bad))
        try:
            if not db.update_shipment(shipment_id, patch):
                return error(404, f"Shipment {shipment_id} was not found.")
            clear_items_cache()  # shipping takes stock out of inventory
            return shipment_response(shipment_id)
        except db.Error as exc:
            return db_error(exc)

    @router.put("/shipments/{shipment_id}/lines", dependencies=admin)
    def put_lines(shipment_id: str, lines: List[Dict[str, Any]]):
        try:
            db.set_shipment_lines(shipment_id, lines)
            return shipment_response(shipment_id)
        except db.Error as exc:
            return db_error(exc)

    @router.patch("/shipments/{shipment_id}/lines/{line_id}", dependencies=admin)
    def patch_line(shipment_id: str, line_id: int, flags: LineFlags):
        try:
            if not db.set_line_flags(shipment_id, line_id, flags.picked, flags.consolidated):
                return error(404, f"Line {line_id} was not found on shipment {shipment_id}.")
            return shipment_response(shipment_id)
        except db.Error as exc:
            return db_error(exc)

    @router.get("/allocations", dependencies=[Depends(require_db)])
    def list_allocations():
        """Units promised to active shipments. Public like /items (the inventory tabs show it without the admin token)."""
        try:
            return db.fetch_allocations()
        except db.Error as exc:
            return db_error(exc)

    @router.post("/shipments/import", dependencies=admin)
    def import_old_shipments(body: ImportBody):
        plans: List[Dict[str, Any]] = []
        errors: List[Dict[str, Any]] = []
        for old, plan_fn in [(o, plan_old_shipment) for o in body.shipments] + [(o, plan_non_inventory) for o in body.non_inventory]:
            try:
                plans.append(plan_fn(old))
            except ValueError as exc:
                errors.append({"id": old.get("id") if isinstance(old, dict) else None, "reason": str(exc)})
        try:
            result = db.import_shipments(plans)
            clear_items_cache()
        except db.Error as exc:
            return db_error(exc)
        result["errors"] = errors + result["errors"]
        return result

    return router

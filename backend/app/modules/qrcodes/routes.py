from __future__ import annotations

import io
import os
import secrets
from datetime import datetime
from typing import Optional

import qrcode
from flask import Blueprint, jsonify, current_app, request, send_file, url_for, redirect

from ...extensions import db
from ...models.qr_code import QRCode
from ...models.item import Item
from ...models.match import Match
from ...models.notification import Notification


bp = Blueprint("qrcodes", __name__, url_prefix="/qrcodes")


def _public_frontend_base() -> Optional[str]:
    # Prefer explicit public base URL for the frontend if configured
    return os.getenv("FRONTEND_PUBLIC_BASE_URL") or os.getenv("PUBLIC_WEB_BASE_URL")


def _ensure_code_for_item(item_id: int) -> QRCode:
    row: Optional[QRCode] = QRCode.query.filter_by(item_id=item_id).first()
    if row:
        return row
    # Generate unique short code
    code = None
    for _ in range(10):
        cand = secrets.token_urlsafe(8).replace("_", "").replace("-", "").lower()
        if not QRCode.query.filter_by(code=cand).first():
            code = cand
            break
    if not code:
        # Fallback to longer code
        code = secrets.token_urlsafe(12).replace("_", "").replace("-", "").lower()
    row = QRCode(code=code, item_id=item_id)
    db.session.add(row)
    db.session.commit()
    return row


def _scan_url(code: str) -> str:
    base = _public_frontend_base()
    if base:
        return f"{base.rstrip('/')}/scan/{code}"
    # Fallback to API endpoint when public base not configured
    # Use external URL for the API endpoint so mobile scanners open a reachable link
    try:
        return url_for("api_v1.qrcodes.resolve_code", code=code, _external=True)  # type: ignore[attr-defined]
    except Exception:
        # As a last resort, return relative path under API
        return f"/api/v1/qrcodes/{code}/item"


@bp.get("/item/<int:item_id>")
def get_item_qrcode(item_id: int):
    it: Optional[Item] = Item.query.get(item_id)
    if not it:
        return jsonify({"error": "Item not found"}), 404
    row = QRCode.query.filter_by(item_id=item_id).first()
    if not row:
        return jsonify({"qrcode": None})
    return jsonify({
        "qrcode": {
            "code": row.code,
            "itemId": int(row.item_id) if row.item_id is not None else None,
            "scanCount": int(row.scan_count or 0),
            "lastScannedAt": row.last_scanned_at.isoformat() if row.last_scanned_at else None,
            "url": _scan_url(row.code),
        }
    })


@bp.post("/item/<int:item_id>")
def create_or_regenerate_item_qrcode(item_id: int):
    it: Optional[Item] = Item.query.get(item_id)
    if not it:
        return jsonify({"error": "Item not found"}), 404
    # Only allow QR for found items (as per requirement)
    if (it.type or "").lower() != "found":
        return jsonify({"error": "QR codes are only generated for found items"}), 400

    data = request.get_json(silent=True) or {}
    regenerate = bool(data.get("regenerate"))

    row = QRCode.query.filter_by(item_id=item_id).first()
    if row and not regenerate:
        return jsonify({
            "qrcode": {
                "code": row.code,
                "itemId": int(row.item_id) if row.item_id is not None else None,
                "scanCount": int(row.scan_count or 0),
                "lastScannedAt": row.last_scanned_at.isoformat() if row.last_scanned_at else None,
                "url": _scan_url(row.code),
            }
        }), 200

    if not row:
        row = _ensure_code_for_item(item_id)
    else:
        # Regenerate code
        code = None
        for _ in range(10):
            cand = secrets.token_urlsafe(8).replace("_", "").replace("-", "").lower()
            if not QRCode.query.filter_by(code=cand).first():
                code = cand
                break
        if not code:
            code = secrets.token_urlsafe(12).replace("_", "").replace("-", "").lower()
        row.code = code
        row.scan_count = 0
        row.last_scanned_at = None
        db.session.commit()

    return jsonify({
        "qrcode": {
            "code": row.code,
            "itemId": int(row.item_id) if row.item_id is not None else None,
            "scanCount": int(row.scan_count or 0),
            "lastScannedAt": row.last_scanned_at.isoformat() if row.last_scanned_at else None,
            "url": _scan_url(row.code),
        }
    }), 201


@bp.get("/<string:code>/image")
def qrcode_image(code: str):
    # If code does not exist, 404 to avoid generating arbitrary QR
    row = QRCode.query.filter_by(code=code).first()
    if not row:
        return jsonify({"error": "QR code not found"}), 404
    size = request.args.get("size")
    try:
        box_size = max(1, min(20, int(size))) if size is not None else 10
    except Exception:
        box_size = 10
    data = _scan_url(code)
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=box_size, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png", max_age=60)


@bp.get("/<string:code>/item")
def resolve_code(code: str):
    row = QRCode.query.filter_by(code=code).first()
    if not row or not row.item_id:
        return jsonify({"error": "QR code not found"}), 404
    it: Optional[Item] = Item.query.get(int(row.item_id))
    if not it:
        return jsonify({"error": "Item not found"}), 404
    # If a public frontend base is configured and this looks like a browser (prefers HTML),
    # redirect to the public scan page so users don't see raw JSON.
    try:
        front_base = _public_frontend_base()
        accepts_html = request.accept_mimetypes and (
            request.accept_mimetypes.best == 'text/html' or 'text/html' in request.accept_mimetypes
        )
        wants_json = request.accept_mimetypes and (
            request.accept_mimetypes.best == 'application/json' or 'application/json' in request.accept_mimetypes
        )
        is_browser = accepts_html and not (wants_json and not accepts_html)
        if front_base and is_browser and request.method == 'GET':
            return redirect(f"{front_base.rstrip('/')}/scan/{code}", code=302)
    except Exception:
        pass
    # Update scan stats best-effort
    try:
        row.scan_count = int(row.scan_count or 0) + 1
        row.last_scanned_at = datetime.utcnow()
        db.session.commit()
    except Exception:
        db.session.rollback()

    # Map item data for public consumption
    out = {
        "id": int(it.id),
        "type": it.type,
        "title": it.title,
        "description": it.description,
        "location": it.location,
        "occurredOn": it.occurred_on.isoformat() if it.occurred_on else None,
        "reportedAt": it.reported_at.isoformat() if it.reported_at else None,
        "status": it.status,
        "photoUrl": it.photo_url,
    }
    return jsonify({
        "item": out,
        "qrcode": {
            "code": row.code,
            "itemId": int(row.item_id),
            "scanCount": int(row.scan_count or 0),
            "lastScannedAt": row.last_scanned_at.isoformat() if row.last_scanned_at else None,
        },
        "instructions": "If this item belongs to you, log in to the Lost & Found portal and request a claim for this item.",
    })


@bp.post("/<string:code>/auto-found")
def auto_report_found(code: str):
    """Scan a QR code attached to a LOST item and automatically create a matching FOUND report.

    Workflow:
      * Locate QR code + associated lost item.
      * Create a new 'found' Item cloning key descriptive fields (title, description).
        Optional client-provided location overrides original lost location.
      * Create/Upsert a Match (score 100, status confirmed) between lost and found items.
      * Update lost item status to 'matched' (idempotent).
      * Generate an in-app Notification for the original reporter (owner) that their item may have been found.
      * Return payload containing both records.

    Request JSON (all optional): { reporterUserId?: int, location?: str }
    """
    data = request.get_json(silent=True) or {}
    reporter_user_id = data.get("reporterUserId")
    location_override = (data.get("location") or "").strip() or None

    # Resolve QR code row
    qr: Optional[QRCode] = QRCode.query.filter_by(code=code).first()
    if not qr or not qr.item_id:
        return jsonify({"error": "QR code not associated with an item"}), 404

    base_item: Optional[Item] = Item.query.get(int(qr.item_id))
    if not base_item:
        return jsonify({"error": "Item not found"}), 404

    # If the associated item is already a FOUND report, nothing to automate – just return it.
    if (base_item.type or "").lower() == "found":
        return jsonify({
            "foundItem": {
                "id": int(base_item.id),
                "type": base_item.type,
                "title": base_item.title,
                "status": base_item.status,
            },
            "message": "QR code already linked to a found item.",
        }), 200

    # Only proceed if the base item is a LOST report
    if (base_item.type or "").lower() != "lost":
        return jsonify({"error": "QR code item is not a lost report"}), 400

    # Validate reporter id if provided
    reporter_id_int: Optional[int] = None
    if reporter_user_id is not None:
        try:
            reporter_id_int = int(reporter_user_id)
        except Exception:
            return jsonify({"error": "Invalid reporterUserId"}), 400

    # Idempotency: If a 100% confirmed match already exists for this lost item, reuse it
    existing_match: Optional[Match] = (
        Match.query.filter_by(lost_item_id=base_item.id, status="confirmed").order_by(Match.created_at.asc()).first()
    )
    if existing_match:
        found_item = Item.query.get(existing_match.found_item_id)
        if found_item:
            return jsonify({
                "lostItem": {
                    "id": int(base_item.id),
                    "type": base_item.type,
                    "title": base_item.title,
                    "status": base_item.status,
                },
                "foundItem": {
                    "id": int(found_item.id),
                    "type": found_item.type,
                    "title": found_item.title,
                    "status": found_item.status,
                },
                "message": "Found report already exists for this lost item.",
            }), 200

    # Create new found item cloning descriptive fields
    from datetime import date as _date
    found_item = Item(
        type="found",
        title=base_item.title,
        description=base_item.description,
        location=location_override or base_item.location,
        occurred_on=_date.today(),
        photo_url=base_item.photo_url,  # reuse photo if any; finder can edit later
        reporter_user_id=reporter_id_int,
    )
    db.session.add(found_item)

    # Prepare notification (after commit we may publish SSE)
    notif: Optional[Notification] = None
    try:
        db.session.flush()  # ensure found_item.id
    except Exception:
        pass

    # Upsert match (score 100)
    match = Match(lost_item_id=base_item.id, found_item_id=found_item.id, score=100, status="confirmed")
    db.session.add(match)

    # Update lost item status if still open
    try:
        if base_item.status == "open":
            base_item.status = "matched"
    except Exception:
        pass

    # Notification to owner of lost item
    if base_item.reporter_user_id:
        try:
            notif = Notification(
                user_id=base_item.reporter_user_id,
                channel="inapp",
                title="Your item may have been found",
                body=f"A found report was automatically generated from a QR scan for ‘{base_item.title}’.",
                payload={
                    "kind": "auto_found",
                    "lostItemId": int(base_item.id),
                    "foundItemId": lambda: int(found_item.id) if found_item.id else None,  # resolved after commit
                    "code": code,
                },
            )
            db.session.add(notif)
        except Exception:
            pass

    # Update scan meta
    try:
        qr.scan_count = int(qr.scan_count or 0) + 1
        qr.last_scanned_at = datetime.utcnow()
    except Exception:
        pass

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to persist auto-found report", "detail": str(e)}), 500

    # Publish SSE notification best-effort
    try:
        if notif and base_item.reporter_user_id:
            from ..notifications.bus import publish as publish_notif  # type: ignore
            publish_notif(int(base_item.reporter_user_id), {
                "type": "notification",
                "notification": {
                    "id": getattr(notif, 'id', None),
                    "title": notif.title,
                    "message": notif.body,
                    "payload": {"kind": "auto_found", "lostItemId": int(base_item.id), "foundItemId": int(found_item.id)},
                    "createdAt": notif.created_at.isoformat() if notif.created_at else None,
                    "read": False,
                },
            })
    except Exception:
        pass

    def _map_item(it: Item) -> dict:
        return {
            "id": int(it.id),
            "type": it.type,
            "title": it.title,
            "description": it.description,
            "location": it.location,
            "occurredOn": it.occurred_on.isoformat() if it.occurred_on else None,
            "reportedAt": it.reported_at.isoformat() if it.reported_at else None,
            "status": it.status,
            "photoUrl": it.photo_url,
            "reporterUserId": int(it.reporter_user_id) if it.reporter_user_id else None,
        }

    return jsonify({
        "lostItem": _map_item(base_item),
        "foundItem": _map_item(found_item),
        "match": {
            "lostItemId": int(base_item.id),
            "foundItemId": int(found_item.id),
            "score": 100,
            "status": "confirmed",
        },
        "message": "Auto-found report created successfully.",
    }), 201

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

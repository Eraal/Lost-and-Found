from __future__ import annotations

import io
import os
import secrets
from datetime import datetime
from typing import Optional

import qrcode
from flask import Blueprint, jsonify, current_app, request, send_file, url_for, redirect, Response
import html as _html

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
    """Return the URL encoded inside the QR.

    Canonical decision: Always encode the backend resolve endpoint. This ensures
    every QR in circulation resolves first to the API, which can then redirect
    (302) to a public /scan/<code> front-end page when a FRONTEND_PUBLIC_BASE_URL
    is configured and the client prefers HTML. That guarantees consistency
    across Admin Items, QR Codes page, printed sheets, and legacy scans.
    """
    try:
        return url_for("api_v1.qrcodes.resolve_code", code=code, _external=True)  # type: ignore[attr-defined]
    except Exception:
        # Fallback relative path (e.g., during testing w/o request context early)
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
            "canonicalUrl": url_for("api_v1.qrcodes.resolve_code", code=row.code, _external=True),  # type: ignore[attr-defined]
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
                "canonicalUrl": url_for("api_v1.qrcodes.resolve_code", code=row.code, _external=True),  # type: ignore[attr-defined]
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
            "canonicalUrl": url_for("api_v1.qrcodes.resolve_code", code=row.code, _external=True),  # type: ignore[attr-defined]
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
        # Only redirect if we have an explicit frontend base configured
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
        # Reporter (finder / submitter) public-safe identity fragment
        "reporter": (
            {
                "id": int(it.reporter.id) if getattr(it.reporter, 'id', None) is not None else None,
                "firstName": getattr(it.reporter, 'first_name', None),
                "lastName": getattr(it.reporter, 'last_name', None),
                "email": getattr(it.reporter, 'email', None),  # Email included – front-end may conditionally show or mask
            }
            if getattr(it, 'reporter', None) else None
        ),
    }
    payload = {
        "item": out,
        "qrcode": {
            "code": row.code,
            "itemId": int(row.item_id),
            "scanCount": int(row.scan_count or 0),
            "lastScannedAt": row.last_scanned_at.isoformat() if row.last_scanned_at else None,
            "canonicalUrl": url_for("api_v1.qrcodes.resolve_code", code=row.code, _external=True),  # type: ignore[attr-defined]
        },
        "instructions": "If this item belongs to you, log in to the Lost & Found portal and request a claim for this item.",
    }

    # HTML fallback (only when no public frontend base configured)
    front_base = _public_frontend_base()
    try:
        accepts_html = request.accept_mimetypes and (
            request.accept_mimetypes.best == 'text/html' or 'text/html' in request.accept_mimetypes
        )
    except Exception:  # pragma: no cover - defensive
        accepts_html = False

    wants_json_explicit = 'application/json' in (request.headers.get('Accept') or '') and 'text/html' not in (request.headers.get('Accept') or '')
    force_json = request.args.get('format') == 'json'
    force_html = request.args.get('format') == 'html'

    if not front_base and (force_html or (accepts_html and not wants_json_explicit)) and not force_json:
        it_pub = payload['item']
        qr_meta = payload['qrcode']
        instructions = payload['instructions']

        def esc(v: object) -> str:
            return _html.escape(str(v)) if v is not None else ''

        reporter = it_pub.get('reporter') or {}
        reporter_name = ' '.join([
            str(reporter.get('firstName') or '').strip(),
            str(reporter.get('lastName') or '').strip()
        ]).strip() or reporter.get('email') or ''
        status_val = (it_pub.get('status') or '').lower()
        status_label_map = {
            'matched': ('Matched', 'background:linear-gradient(90deg,#eef2ff,#e0e7ff);color:#3730a3;border:1px solid #c7d2fe'),
            'claimed': ('Claimed', 'background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0'),
            'closed': ('Returned', 'background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd'),
            'returned': ('Returned', 'background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd'),
            'claim_pending': ('Claim Pending', 'background:#fffbeb;color:#92400e;border:1px solid #fde68a'),
            'claim_approved': ('Claim Approved', 'background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0'),
            'claim_rejected': ('Claim Rejected', 'background:#fef2f2;color:#991b1b;border:1px solid #fecaca'),
        }
        status_text, status_style = status_label_map.get(status_val, ('Open', 'background:#fefce8;color:#854d0e;border:1px solid #fde68a'))
        photo = it_pub.get('photoUrl')
        occurred_on = it_pub.get('occurredOn')
        reported_at = it_pub.get('reportedAt')
        location = it_pub.get('location')
        type_label = 'Found Item' if (it_pub.get('type') or '').lower() == 'found' else 'Lost Item'

        # Use sentinel tokens to avoid Python format() brace parsing issues with CSS
        template = """<!DOCTYPE html><html lang='en'>
<head>
    <meta charset='utf-8' />
    <meta name='viewport' content='width=device-width,initial-scale=1' />
    <title>__TITLE__ • QR Scan • Lost & Found</title>
    <meta name='description' content='QR scanned item – Lost & Found portal.' />
    <style>
        :root { --ink:#0f172a; --brand:#4f46e5; --radius:20px; font-family: system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; }
        body { margin:0; background:linear-gradient(145deg,#eef2ff,#ffffff 35%,#f0f9ff); color:var(--ink); }
        .shell { max-width:900px; margin:40px auto 60px; padding: clamp(1rem,2.5vw,2rem); }
        .card { position:relative; background:rgba(255,255,255,0.9); backdrop-filter:blur(10px); border:1px solid #e2e8f0; border-radius:32px; box-shadow:0 8px 30px -8px rgba(30,41,59,.15); overflow:hidden; }
        .top-bar { position:absolute; inset:0 0 auto 0; height:5px; background:linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899,#06b6d4); }
        h1 { font-size:clamp(1.6rem,2.4rem,2.6rem); line-height:1.15; margin:0 0 .75rem; font-weight:800; letter-spacing:-.02em; }
        .flex { display:flex; gap:2rem; flex-wrap:wrap; }
        .media img { width:230px; height:230px; object-fit:cover; border-radius:24px; border:2px solid #e2e8f0; box-shadow:0 4px 10px -4px rgba(0,0,0,.12); background:#fff; }
        .media .ph { width:230px; height:230px; display:grid; place-items:center; border-radius:24px; background:linear-gradient(135deg,#f1f5f9,#e2e8f0); font-size:54px; color:#64748b; border:2px dashed #cbd5e1; }
        .badges { display:flex; flex-wrap:wrap; gap:.6rem; margin:.25rem 0 1rem; }
        .badge { font-size:11px; font-weight:600; padding:6px 10px; border-radius:999px; letter-spacing:.03em; text-transform:uppercase; display:inline-flex; align-items:center; gap:.35rem; }
        .type { background:#eef2ff; color:#3730a3; border:1px solid #c7d2fe; }
        .meta { display:flex; flex-wrap:wrap; gap:1.1rem; font-size:13px; margin:0 0 1.2rem; color:#334155; }
        .meta span { display:inline-flex; align-items:center; gap:.4rem; }
        .desc { font-size:15px; line-height:1.55; white-space:pre-line; background:#f8fafc; padding:14px 16px; border-radius:16px; border:1px solid #e2e8f0; margin:0 0 1.4rem; }
        .panel { background:#f1f5f9; border:1px solid #e2e8f0; padding:18px 20px; border-radius:18px; font-size:14px; color:#334155; }
        .actions { margin-top:14px; display:flex; flex-wrap:wrap; gap:.75rem; }
        .btn { appearance:none; border:none; cursor:pointer; font-weight:600; font-size:14px; border-radius:12px; padding:10px 18px; display:inline-flex; align-items:center; gap:.5rem; letter-spacing:.01em; }
        .btn-primary { background:linear-gradient(90deg,#4f46e5,#6366f1); color:#fff; box-shadow:0 4px 14px -4px rgba(79,70,229,.4); }
        .btn-primary:hover { filter:brightness(1.05); }
        .btn-outline { background:#fff; border:1px solid #cbd5e1; color:#334155; }
        .btn-outline:hover { background:#f1f5f9; }
        code { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; background:#f8fafc; padding:3px 6px; border-radius:6px; border:1px solid #e2e8f0; }
        footer { margin-top:40px; text-align:center; font-size:12px; color:#64748b; }
        @media (max-width:800px){ .flex {flex-direction:column;} .media img,.media .ph {width:100%; height:auto; max-height:260px;} }
    </style>
    <script>function go(p){window.location.href=p}</script>
</head>
<body>
    <div class='shell'>
        <div class='card'>
            <div class='top-bar'></div>
            <div style='padding:clamp(1.2rem,2.5vw,2.2rem) clamp(1.2rem,2.8vw,2.6rem)'>
                <div class='flex'>
                    <div class='media'>
                        __MEDIA_BLOCK__
                    </div>
                    <div class='content' style='flex:1;min-width:250px;'>
                        <h1>__TITLE__</h1>
                        <div class='badges'>
                            <span class='badge type'>__TYPE_LABEL__</span>
                            <span class='badge status' style="__STATUS_STYLE__">__STATUS_TEXT__</span>
                        </div>
                        <div class='meta'>
                            __META_LOCATION____META_OCCURRED____META_REPORTED____META_REPORTER__<span>🔁 Scans: __SCAN_COUNT__</span>
                        </div>
                        __DESCRIPTION_BLOCK__
                        <div class='panel'>
                            <div>__INSTRUCTIONS__</div>
                            <div class='actions'>
                                <button class='btn btn-primary' onclick="go('/login')">Login to Claim</button>
                                <button class='btn btn-outline' onclick="go('/register')">Register</button>
                            </div>
                            <div style='margin-top:14px;font-size:12px;color:#475569;'>QR Code: <code>__QR_CODE__</code></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <footer>Lost &amp; Found Portal • QR Scan Detail</footer>
    </div>
</body></html>"""

        media_block = (f"<img src='{esc(photo)}' alt='Item' loading='lazy' />" if photo else "<div class='ph'>📦</div>")
        meta_location = f"<span>📍 {esc(location)}</span>" if location else ""
        meta_occurred = f"<span>📅 {esc(occurred_on)}</span>" if occurred_on else ""
        meta_reported = f"<span>🕒 {esc(reported_at)}</span>" if reported_at else ""
        meta_reporter = f"<span>🧍 Finder: {esc(reporter_name)}</span>" if reporter_name else ""
        description_block = f"<div class='desc'>{esc(it_pub.get('description'))}</div>" if it_pub.get('description') else ""

        replacements = {
            '__TITLE__': esc(it_pub.get('title')),
            '__TYPE_LABEL__': esc(type_label),
            '__STATUS_TEXT__': esc(status_text),
            '__STATUS_STYLE__': esc(status_style),
            '__MEDIA_BLOCK__': media_block,
            '__META_LOCATION__': meta_location,
            '__META_OCCURRED__': meta_occurred,
            '__META_REPORTED__': meta_reported,
            '__META_REPORTER__': meta_reporter,
            '__SCAN_COUNT__': str(qr_meta['scanCount']),
            '__DESCRIPTION_BLOCK__': description_block,
            '__INSTRUCTIONS__': esc(instructions),
            '__QR_CODE__': esc(qr_meta['code']),
        }
        html_doc = template
        for k,v in replacements.items():
            html_doc = html_doc.replace(k, v)
        return Response(html_doc, mimetype='text/html; charset=utf-8')

        # Default JSON output
        return jsonify(payload)


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


@bp.get("/ensure-item/<int:item_id>")
def ensure_item_qrcode(item_id: int):
    """Ensure a QR code exists for the given item and return (or redirect to) its standard view.

    Use cases:
      * Admin 'All Found' or 'All Items' tables have items missing QR rows – this endpoint lazily creates them.
      * Front-end can call this before showing a QR preview modal to avoid 404s.

    Behavior:
      * Returns JSON payload: { code, itemId, scanUrl, created: bool }
      * If a public frontend base exists AND request prefers HTML (or redirect=1), redirect to /scan/<code> for consistency.
    """
    item: Optional[Item] = Item.query.get(int(item_id))
    if not item:
        return jsonify({"error": "Item not found"}), 404

    # Find existing QR or create
    existing: Optional[QRCode] = QRCode.query.filter_by(item_id=item.id).first()
    created = False
    if not existing:
        existing = _ensure_code_for_item(int(item.id))
        created = True

    scan_url = _scan_url(existing.code)

    # Optional redirect for browser consistency
    front_base = _public_frontend_base()
    wants_redirect = request.args.get('redirect') == '1'
    try:
        accepts_html = request.accept_mimetypes and (
            request.accept_mimetypes.best == 'text/html' or 'text/html' in request.accept_mimetypes
        )
    except Exception:  # pragma: no cover
        accepts_html = False

    if front_base and (wants_redirect or accepts_html) and request.args.get('format') != 'json':
        return redirect(f"{front_base.rstrip('/')}/scan/{existing.code}", code=302)

    return jsonify({
        "code": existing.code,
        "itemId": int(existing.item_id),
        "scanUrl": scan_url,
        "created": created,
        "canonicalUrl": url_for("api_v1.qrcodes.resolve_code", code=existing.code, _external=True),  # type: ignore[attr-defined]
    })

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

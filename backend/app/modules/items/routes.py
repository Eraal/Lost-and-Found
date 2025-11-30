from datetime import datetime, date
import os
import secrets
from flask import Blueprint, request, jsonify, current_app, url_for, g

from io import BytesIO
from PIL import Image
import boto3
from botocore.client import Config as BotoConfig
from ...extensions import db
from ...models.item import Item
from ...models.match import Match
from ...models.notification import Notification
from ...models.social_post import SocialPost
from ...models.app_setting import AppSetting
import json
from ...models.qr_code import QRCode
try:
    from ..notifications.bus import publish as publish_notif
except Exception:  # pragma: no cover
    def publish_notif(user_id: int, event: dict):  # type: ignore
        return None

# Reuse scoring helpers from smart search module
try:
    from ..search.routes import (
        _candidate_query,
        _compose_text,
        _date_from_item,
        _idf,
        _score_pair,
        _tokenize,
    )
except Exception:  # Fallback if import location changes
    _candidate_query = _compose_text = _date_from_item = _idf = _score_pair = _tokenize = None  # type: ignore

bp = Blueprint("items", __name__, url_prefix="/items")


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except Exception:
            continue
    return None


def _item_to_dict(it: Item) -> dict:
    thumb_url = getattr(it, "photo_thumb_url", None)
    if not thumb_url and it.photo_url:
        try:
            if "/uploads/" in it.photo_url:
                thumb_url = it.photo_url.replace("/uploads/", "/uploads/thumbs/", 1)
        except Exception:
            thumb_url = None

    # If thumb is a local uploads path but file is missing, fall back to original photo
    try:
        if thumb_url and isinstance(thumb_url, str) and thumb_url.startswith("/uploads/"):
            base = current_app.config.get("UPLOAD_FOLDER")
            rel = thumb_url[len("/uploads/"):]
            candidate = os.path.join(base, rel) if base else None
            exists = os.path.isfile(candidate) if candidate else False
            if not exists:
                # try legacy base (backend/uploads)
                legacy_base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads"))
                legacy_path = os.path.join(legacy_base, rel)
                exists = os.path.isfile(legacy_path)
            if not exists:
                # thumb file missing; don't advertise thumb URL so clients use main photo
                thumb_url = None
    except Exception:
        pass
    payload = {
        "id": it.id,
        "type": it.type,
        "title": it.title,
        "description": it.description,
        "location": it.location,
        "occurredOn": it.occurred_on.isoformat() if it.occurred_on else None,
        "reportedAt": it.reported_at.isoformat() if it.reported_at else None,
        "status": it.status,
    "photoUrl": it.photo_url,
    "photoThumbUrl": thumb_url,
        "reporterUserId": it.reporter_user_id,
    }
    # Enrich with reporter (finder) details when relationship is available. This allows
    # the frontend to show the name of the user who reported a FOUND (unclaimed) item.
    try:
        if getattr(it, "reporter", None):
            r = it.reporter  # type: ignore[attr-defined]
            payload["reporter"] = {
                "id": getattr(r, "id", None),
                "email": getattr(r, "email", None),
                "firstName": getattr(r, "first_name", None),
                "lastName": getattr(r, "last_name", None),
                "studentId": getattr(r, "student_id", None),
            }
    except Exception:  # pragma: no cover - enrichment is best-effort
        pass
    return payload


def _auto_match_for_item(item: Item, threshold: float = 0.5, limit: int = 200) -> list[dict]:
    """Compute smart matches for a single item and persist high-confidence pairs.

    Returns a list of { lostItemId, foundItemId, score } for suggestions (score as percentage 0-100).
    """
    # Ensure helpers are available
    if not all([_candidate_query, _compose_text, _date_from_item, _idf, _score_pair, _tokenize]):
        return []

    opposite = "found" if item.type == "lost" else "lost"
    base_text = _compose_text(item)
    base_loc = item.location
    base_date = _date_from_item(item)

    candidates = list(_candidate_query(opposite_type=opposite, location=base_loc, around=base_date))[: max(0, limit)]
    # Build shared IDF across base + candidates for consistent scoring
    docs = [_tokenize(base_text)] + [_tokenize(_compose_text(it)) for it in candidates]
    idf = _idf(docs)

    suggestions: list[dict] = []
    notified_user_ids: set[int] = set()
    for cand in candidates:
        score01 = _score_pair(base_text, _compose_text(cand), base_loc, cand.location, base_date, _date_from_item(cand), idf)
        if score01 >= threshold:
            # Store score in percentage with 2 decimal precision
            score_pct = round(float(score01) * 100.0, 2)
            # Determine correct pairing orientation
            lost_id = item.id if item.type == "lost" else cand.id
            found_id = cand.id if item.type == "lost" else item.id

            # Idempotently upsert match
            existing = Match.query.filter_by(lost_item_id=lost_id, found_item_id=found_id).first()
            if existing:
                # Keep the higher score if new score is better
                try:
                    if float(existing.score or 0) < score_pct:
                        existing.score = score_pct
                except Exception:
                    existing.score = score_pct
            else:
                m = Match(lost_item_id=lost_id, found_item_id=found_id, score=score_pct)
                db.session.add(m)

            suggestions.append({
                "lostItemId": lost_id,
                "foundItemId": found_id,
                "score": score_pct,
            })

            # Notifications
            try:
                # Always notify the reporter who just created this item (if available)
                if item.reporter_user_id:
                    payload = {
                        "kind": "match",
                        "lostItemId": lost_id,
                        "foundItemId": found_id,
                        "score": score_pct,
                        # If your Item model includes a category field in the future, set it here
                        # "category": getattr(item, "category", None) or getattr(cand, "category", None),
                        "base": {
                            "id": item.id,
                            "type": item.type,
                            "title": item.title,
                            "location": item.location,
                            "occurredOn": item.occurred_on.isoformat() if item.occurred_on else None,
                        },
                        "candidate": {
                            "id": cand.id,
                            "type": cand.type,
                            "title": cand.title,
                            "location": cand.location,
                            "occurredOn": cand.occurred_on.isoformat() if cand.occurred_on else None,
                        },
                    }
                    db.session.add(
                        Notification(
                            user_id=item.reporter_user_id,
                            channel="inapp",
                            title="Potential match found",
                            body=f"We found a {opposite} item that may match ‘{item.title}’ ({int(round(score_pct))}% match).",
                            payload=payload,
                        )
                    )
                    notified_user_ids.add(int(item.reporter_user_id))
                # If this is a found item, also notify the owner (lost reporter) when known
                if item.type == "found" and getattr(cand, "type", None) == "lost" and getattr(cand, "reporter_user_id", None):
                    payload2 = {
                        "kind": "match",
                        "lostItemId": lost_id,
                        "foundItemId": found_id,
                        "score": score_pct,
                        # "category": getattr(cand, "category", None) or getattr(item, "category", None),
                        "base": {
                            "id": cand.id,
                            "type": cand.type,
                            "title": cand.title,
                            "location": cand.location,
                            "occurredOn": cand.occurred_on.isoformat() if cand.occurred_on else None,
                        },
                        "candidate": {
                            "id": item.id,
                            "type": item.type,
                            "title": item.title,
                            "location": item.location,
                            "occurredOn": item.occurred_on.isoformat() if item.occurred_on else None,
                        },
                    }
                    db.session.add(
                        Notification(
                            user_id=cand.reporter_user_id,
                            channel="inapp",
                            title="Possible match for your lost item",
                            body=f"A found report may match your ‘{cand.title}’ ({int(round(score_pct))}% match).",
                            payload=payload2,
                        )
                    )
                    try:
                        notified_user_ids.add(int(cand.reporter_user_id))
                    except Exception:
                        pass
            except Exception:
                # Notifications are best-effort; ignore failures
                pass

    # Commit any created/updated matches and notifications
    if suggestions:
        # Collect notifications created in-session for publishing after commit
        # We query minimal recent rows for this user(s) as a simple approach
        try:
            db.session.commit()
            # Publish best-effort SSE events to involved users
            try:
                for uid in notified_user_ids:
                    recent = (
                        Notification.query.filter_by(user_id=uid)
                        .order_by(Notification.created_at.desc()).limit(3).all()
                    )
                    for n in recent:
                        if isinstance(n.payload, dict) and n.payload.get("kind") == "match":
                            publish_notif(uid, {
                                "type": "notification",
                                "notification": {
                                    "id": n.id,
                                    "title": n.title,
                                    "message": n.body,
                                    "createdAt": n.created_at.isoformat() if n.created_at else None,
                                    "read": bool(n.read_at),
                                    "payload": n.payload,
                                },
                            })
            except Exception:
                pass
        except Exception:
            db.session.rollback()
    return suggestions


@bp.get("")
def list_items():
    # Return items from DB with optional filters: type, reporterUserId, limit
    try:
        limit = int(request.args.get("limit", 8))
    except (TypeError, ValueError):
        limit = 8

    q = Item.query

    type_param = request.args.get("type")
    if type_param in ("lost", "found"):
        q = q.filter(Item.type == type_param)

    reporter = request.args.get("reporterUserId") or request.args.get("reporter_user_id")
    if reporter:
        try:
            reporter_id = int(reporter)
            q = q.filter(Item.reporter_user_id == reporter_id)
        except ValueError:
            pass

    # Optional approval-gating for public visibility
    try:
        require_approval = AppSetting.get_bool("features.item_approval.required", True)
    except Exception:
        require_approval = True

    if require_approval:
        try:
            raw = AppSetting.get("items.approved.set", None)
            approved_ids = set(int(x) for x in (json.loads(raw) if raw else []))
        except Exception:
            approved_ids = set()
        # Only filter when we have at least one approved id recorded. This preserves
        # legacy installs until the first approval is made by an admin.
        if approved_ids:
            q = q.filter(Item.id.in_(approved_ids))

    items = q.order_by(Item.reported_at.desc()).limit(max(0, limit)).all()
    # NOTE: We intentionally reuse _item_to_dict which now includes optional reporter data.
    return jsonify({"items": [_item_to_dict(it) for it in items]})


@bp.post("")
def create_item():
    """Create a lost/found item.

    Accepts either application/json or multipart/form-data.
    For multipart, expects fields: type, title, description, location, occurredOn, and file field 'photo'.
    Reporter attribution is automatic from the current user context (X-User-Id header) and
    the legacy reporterUserId field is ignored if a current user is resolved.
    """
    content_type = request.content_type or ""
    is_multipart = content_type.startswith("multipart/form-data")

    # Defaults shared across branches
    photo_url = None
    photo_thumb_url = None

    if is_multipart:
        form = request.form
        item_type = (form.get("type") or "lost").strip()
        title = (form.get("title") or "").strip()
        description = (form.get("description") or "").strip() or None
        location = (form.get("location") or "").strip() or None
        occurred_on = _parse_date(form.get("occurredOn") or form.get("occurred_on"))
        # Legacy reporter field (will be overridden by authenticated user if present)
        reporter = form.get("reporterUserId") or form.get("reporter_user_id")
        photo_file = request.files.get("photo")

        if photo_file and photo_file.filename:
            # generate a safe random filename, keep extension if present
            ext = os.path.splitext(photo_file.filename)[1].lower()[:10]
            fname = secrets.token_hex(16) + ext

            # Read bytes once
            file_bytes = photo_file.read()

            # Create thumbnail
            try:
                img = Image.open(BytesIO(file_bytes))
                img.thumbnail((480, 480))
                thumb_io = BytesIO()
                thumb_format = 'JPEG'
                if ext in ('.png', '.webp'):
                    thumb_format = 'PNG'
                img.save(thumb_io, format=thumb_format, optimize=True)
                thumb_bytes = thumb_io.getvalue()
            except Exception:
                thumb_bytes = None

            # Optional S3 path
            s3_bucket = current_app.config.get("S3_BUCKET_NAME")
            if s3_bucket:
                s3 = boto3.client(
                    's3',
                    region_name=current_app.config.get("S3_REGION") or None,
                    aws_access_key_id=current_app.config.get("S3_ACCESS_KEY_ID") or None,
                    aws_secret_access_key=current_app.config.get("S3_SECRET_ACCESS_KEY") or None,
                    endpoint_url=current_app.config.get("S3_ENDPOINT_URL") or None,
                    config=BotoConfig(s3={'addressing_style': 'virtual'})
                )
                key = f"uploads/{fname}"
                s3.put_object(Bucket=s3_bucket, Key=key, Body=file_bytes, ContentType=photo_file.mimetype or 'application/octet-stream', ACL='public-read')
                if thumb_bytes is not None:
                    tkey = f"uploads/thumbs/{fname}"
                    s3.put_object(Bucket=s3_bucket, Key=tkey, Body=thumb_bytes, ContentType='image/jpeg', ACL='public-read')

                base = current_app.config.get("S3_PUBLIC_URL_BASE")
                if base:
                    photo_url = f"{base}/{key}"
                    photo_thumb_url = f"{base}/{tkey}" if thumb_bytes is not None else None
                else:
                    region = current_app.config.get("S3_REGION") or 'us-east-1'
                    photo_url = f"https://{s3_bucket}.s3.{region}.amazonaws.com/{key}"
                    photo_thumb_url = f"https://{s3_bucket}.s3.{region}.amazonaws.com/{tkey}" if thumb_bytes is not None else None
            else:
                # Local storage
                upload_folder = current_app.config["UPLOAD_FOLDER"]
                os.makedirs(os.path.join(upload_folder, 'thumbs'), exist_ok=True)
                path = os.path.join(upload_folder, fname)
                with open(path, 'wb') as f:
                    f.write(file_bytes)
                if thumb_bytes is not None:
                    tpath = os.path.join(upload_folder, 'thumbs', fname)
                    with open(tpath, 'wb') as f:
                        f.write(thumb_bytes)

                # Store relative URLs to avoid mixed-content and host coupling; Nginx proxies /uploads
                photo_url = url_for("uploads", filename=fname, _external=False)
                photo_thumb_url = url_for("uploads", filename=f"thumbs/{fname}", _external=False) if thumb_bytes is not None else None
        else:
            # No file uploaded; allow URLs provided via form fields
            photo_url = (form.get("photoUrl") or form.get("photo_url") or "").strip() or None
            photo_thumb_url = (form.get("photoThumbUrl") or form.get("photo_thumb_url") or "").strip() or None
    else:
        data = request.get_json(silent=True) or {}
        item_type = (data.get("type") or "lost").strip()
        title = (data.get("title") or "").strip()
        description = (data.get("description") or "").strip() or None
        location = (data.get("location") or "").strip() or None
        occurred_on = _parse_date(data.get("occurredOn") or data.get("occurred_on"))
        reporter = data.get("reporterUserId") or data.get("reporter_user_id")
        photo_url = (data.get("photoUrl") or data.get("photo_url") or "").strip() or None
        photo_thumb_url = (data.get("photoThumbUrl") or data.get("photo_thumb_url") or "").strip() or None

    if item_type not in ("lost", "found"):
        return jsonify({"error": "Invalid item type"}), 400
    if not title:
        return jsonify({"error": "Title is required"}), 400

    reporter_id = None
    # Preferred: current authenticated user id from request context
    current_uid = getattr(g, 'current_user_id', None)
    if current_uid:
        try:
            reporter_id = int(current_uid)
        except Exception:
            reporter_id = None
    elif reporter is not None:
        # Backward compatibility for older clients still sending reporterUserId (dev only)
        if current_app.config.get('DEBUG'):
            try:
                reporter_id = int(reporter)
            except (TypeError, ValueError):
                return jsonify({"error": "Invalid reporter user id"}), 400
        else:
            # In production, do not allow client-supplied reporter id without auth
            reporter_id = None

    # Persist
    item = Item(
        type=item_type,
        title=title,
        description=description,
        location=location,
        occurred_on=occurred_on,
        photo_url=photo_url,
        reporter_user_id=reporter_id,
    )

    # Attach transient attribute for response (if model lacks dedicated column for thumb)
    if photo_thumb_url:
        setattr(item, 'photo_thumb_url', photo_thumb_url)

    db.session.add(item)
    db.session.commit()

    # After creation, attempt social auto-post if enabled
    try:
        auto_post = AppSetting.get_bool("social.facebook.auto_post", False)
        if auto_post:
            # prepare message
            kind = "Lost" if item.type == "lost" else "Found"
            lines: list[str] = [f"{kind} Item: {item.title}"]
            if item.description:
                lines.append(item.description)
            meta: list[str] = []
            if item.location:
                meta.append(f"Location: {item.location}")
            if item.occurred_on:
                try:
                    meta.append(f"Date: {item.occurred_on.strftime('%Y-%m-%d')}")
                except Exception:
                    pass
            if meta:
                lines.append(" • ".join(meta))
            # Public link to item details page if available (frontend route); fallback to uploads image
            base_frontend = os.getenv("FRONTEND_PUBLIC_BASE_URL") or os.getenv("PUBLIC_WEB_BASE_URL")
            link_url = None
            if base_frontend:
                # Example: /items/<id> or /admin/items
                link_url = f"{base_frontend.rstrip('/')}/items/{int(item.id)}"
            elif item.photo_url:
                link_url = item.photo_url

            message = "\n".join(lines)

            # Persist social post row as queued
            sp = SocialPost(item_id=item.id, platform="facebook", message=message, link_url=link_url, status="queued")
            db.session.add(sp)
            db.session.commit()

            # Dispatch background job if celery configured; else best-effort inline post
            posted_ok = False
            try:
                from ...tasks.jobs.social import post_item_to_facebook  # type: ignore
                # If CELERY is configured, enqueue task; otherwise, calling delay may raise
                post_item_to_facebook.delay(message, link_url)
                posted_ok = True  # consider enqueued as ok
            except Exception:
                # Fallback: try direct post synchronously
                try:
                    from ...integrations.facebook.client import post_to_page  # type: ignore
                    resp = post_to_page(message, link_url)
                    sp.post_external_id = str(resp.get("id") or resp.get("post_id") or "")
                    sp.status = "sent"
                    sp.posted_at = datetime.utcnow()
                    db.session.commit()
                    posted_ok = True
                except Exception:
                    posted_ok = False
            if not posted_ok:
                try:
                    sp.status = "failed"
                    db.session.commit()
                except Exception:
                    db.session.rollback()
    except Exception:
        # Never block item creation on social errors
        pass

    # Run auto-match and generate suggestions (non-blocking best-effort)
    try:
        _auto_match_for_item(item, threshold=0.5, limit=200)
    except Exception:
        # Do not fail the request if auto-match errors
        pass

    # Auto-generate QR code for found items
    try:
        if (item.type or "").lower() == "found":
            # Check if QR exists; if not, create one
            existing = QRCode.query.filter_by(item_id=item.id).first()
            if not existing:
                # Generate unique code (module-level 'secrets' already imported; avoid re-import inside function)
                code = None
                for _ in range(10):
                    cand = secrets.token_urlsafe(8).replace("_", "").replace("-", "").lower()
                    if not QRCode.query.filter_by(code=cand).first():
                        code = cand
                        break
                if not code:
                    code = secrets.token_urlsafe(12).replace("_", "").replace("-", "").lower()
                qr = QRCode(code=code, item_id=item.id)
                db.session.add(qr)
                db.session.commit()
    except Exception:
        db.session.rollback()

    # Response
    payload = _item_to_dict(item)
    # Enrich reporter block for convenience in responses (mirrors admin output shape subset)
    try:
        if item.reporter:
            payload["reporter"] = {
                "id": item.reporter.id,
                "email": getattr(item.reporter, 'email', None),
                "firstName": getattr(item.reporter, 'first_name', None),
                "lastName": getattr(item.reporter, 'last_name', None),
                "studentId": getattr(item.reporter, 'student_id', None),
            }
    except Exception:
        pass
    try:
        if (item.type or "").lower() == "found":
            # Include QR URLs for convenience if blueprint is mounted
            from flask import url_for as _url_for
            qr = QRCode.query.filter_by(item_id=item.id).first()
            if qr:
                payload = {
                    **payload,
                    "qr": {
                        "code": qr.code,
                        "image": _url_for("api_v1.qrcodes.qrcode_image", code=qr.code, _external=True),  # type: ignore[attr-defined]
                        "scanUrl": _url_for("api_v1.qrcodes.resolve_code", code=qr.code, _external=True),  # type: ignore[attr-defined]
                    },
                }
    except Exception:
        pass

    return jsonify(payload), 201

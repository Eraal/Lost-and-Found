from __future__ import annotations

from datetime import datetime
from flask import Blueprint, jsonify, request
import os
from urllib.parse import urlparse, urljoin

from ...extensions import db
from ...models.social_post import SocialPost
from ...models.item import Item
from ...models.app_setting import AppSetting
from ...integrations.facebook.client import get_page_info, post_to_page, post_photo_to_page

bp = Blueprint("social", __name__, url_prefix="/social")


def _build_message_for_item(item: Item) -> tuple[str, str | None]:
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
    base_frontend = (request.host_url.rstrip('/') if request else None)
    # Prefer configured base
    base_frontend = os.getenv("FRONTEND_PUBLIC_BASE_URL") or os.getenv("PUBLIC_WEB_BASE_URL") or base_frontend

    def _is_public_http_url(u: str | None) -> bool:
        if not u:
            return False
        try:
            p = urlparse(u)
        except Exception:
            return False
        if p.scheme not in {"http", "https"} or not p.netloc:
            return False
        # Avoid localhost/loopback for FB link param
        host = p.hostname or ""
        if host in {"localhost", "127.0.0.1", "::1"}:
            return False
        return True

    # Prefer an item details page when we have a proper public base URL
    link_url: str | None = None
    if base_frontend and _is_public_http_url(base_frontend):
        link_url = f"{base_frontend.rstrip('/')}/items/{int(item.id)}"
    else:
        # Try to use a public absolute photo URL if available
        photo = item.photo_url or None
        if photo:
            if photo.startswith("/") and base_frontend and _is_public_http_url(base_frontend):
                link_url = urljoin(base_frontend + "/", photo.lstrip("/"))
            elif _is_public_http_url(photo):
                link_url = photo

    # Only return link if valid for Facebook
    if not _is_public_http_url(link_url):
        link_url = None

    return ("\n".join(lines), link_url)


@bp.get("/status")
def social_status():
    import os
    auto_post = AppSetting.get_bool("social.facebook.auto_post", False)
    page_id = bool(os.getenv("FACEBOOK_PAGE_ID") or AppSetting.get("social.facebook.page_id"))
    token = bool(os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN") or AppSetting.get("social.facebook.page_access_token"))
    return jsonify({
        "facebook": {
            "autoPost": auto_post,
            "pageConfigured": page_id,
            "tokenConfigured": token,
        }
    })


@bp.get("/facebook/credentials")
def get_facebook_credentials():
    # Only reveal whether values exist, not the secrets themselves
    page_id = AppSetting.get("social.facebook.page_id")
    token = AppSetting.get("social.facebook.page_access_token")
    return jsonify({
        "pageId": page_id or None,
        "hasToken": bool(token),
    })


@bp.post("/facebook/verify")
def verify_facebook():
    """Verify that the current or provided pageId/token are valid.

    Body: { pageId?: string, pageAccessToken?: string }
    """
    data = request.get_json(silent=True) or {}
    page_id = (data.get("pageId") or AppSetting.get("social.facebook.page_id") or "").strip() or None
    token = (data.get("pageAccessToken") or AppSetting.get("social.facebook.page_access_token") or "").strip() or None
    try:
        info = get_page_info(page_id=page_id, token=token)
        return jsonify({"ok": True, "page": info})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@bp.put("/facebook/credentials")
def update_facebook_credentials():
    data = request.get_json(silent=True) or {}
    page_id = (data.get("pageId") or "").strip() or None
    token = (data.get("pageAccessToken") or "").strip() or None
    if page_id is not None:
        AppSetting.set("social.facebook.page_id", page_id)
    if token is not None:
        AppSetting.set("social.facebook.page_access_token", token)
    return jsonify({"ok": True})


@bp.get("/posts")
def list_posts():
    try:
        limit = int(request.args.get("limit", 50))
    except Exception:
        limit = 50
    limit = max(1, min(200, limit))
    rows: list[SocialPost] = (
        SocialPost.query.order_by(SocialPost.created_at.desc()).limit(limit).all()
    )

    def to_dict(sp: SocialPost) -> dict:
        item = sp.item
        return {
            "id": sp.id,
            "platform": sp.platform,
            "status": sp.status,
            "message": sp.message,
            "linkUrl": sp.link_url,
            "postExternalId": sp.post_external_id,
            "postedAt": sp.posted_at.isoformat() if sp.posted_at else None,
            "createdAt": sp.created_at.isoformat() if sp.created_at else None,
            "item": {
                "id": getattr(item, "id", None),
                "type": getattr(item, "type", None),
                "title": getattr(item, "title", None),
                "location": getattr(item, "location", None),
                "photoUrl": getattr(item, "photo_url", None),
            } if item else None,
        }

    return jsonify({"posts": [to_dict(sp) for sp in rows]})


@bp.post("/posts")
def create_post():
    data = request.get_json(silent=True) or {}
    try:
        item_id = int(data.get("itemId"))
    except Exception:
        return jsonify({"error": "itemId is required"}), 400
    item: Item | None = Item.query.get(item_id)
    if not item:
        return jsonify({"error": "Item not found"}), 404

    message = (data.get("message") or "").strip()
    link = (data.get("link") or "").strip() or None
    want_image = bool(data.get("withImage"))
    if not message:
        message, default_link = _build_message_for_item(item)
        link = link or default_link

    # Normalize/validate link for FB; if invalid, omit it
    def _is_public_http_url(u: str | None) -> bool:
        if not u:
            return False
        try:
            p = urlparse(u)
        except Exception:
            return False
        if p.scheme not in {"http", "https"} or not p.netloc:
            return False
        host = p.hostname or ""
        if host in {"localhost", "127.0.0.1", "::1"}:
            return False
        return True

    if link and not _is_public_http_url(link):
        link = None

    # Prepare optional image payload
    image_url: str | None = None
    image_path: str | None = None
    if want_image and item.photo_url:
        base_frontend = os.getenv("FRONTEND_PUBLIC_BASE_URL") or os.getenv("PUBLIC_WEB_BASE_URL") or (request.host_url.rstrip('/') if request else None)
        # Build a public image URL if possible
        photo = item.photo_url
        if photo.startswith("/") and base_frontend and _is_public_http_url(base_frontend):
            image_url = urljoin(base_frontend + "/", photo.lstrip("/"))
        elif _is_public_http_url(photo):
            image_url = photo
        # Fallback to local file if we cannot create a public URL
        if not image_url:
            try:
                from ...config import get_config
                cfg = get_config(None)
                uploads = getattr(cfg, 'UPLOAD_FOLDER', None)
                if uploads:
                    # Try basename under uploads
                    fname = os.path.basename(photo)
                    candidate = os.path.join(uploads, fname)
                    if os.path.isfile(candidate):
                        image_path = candidate
            except Exception:
                pass

    sp = SocialPost(item_id=item.id, platform="facebook", message=message, link_url=link, status="queued")
    db.session.add(sp)
    db.session.commit()

    # Try to post via Celery first; fallback to direct
    ok = False
    force_direct = str(request.args.get("direct", "")).strip() in {"1", "true", "yes", "on"} or bool(data.get("direct"))
    use_celery = bool(os.getenv("CELERY_BROKER_URL")) and not force_direct
    if use_celery:
        try:
            from ...tasks.jobs.social import post_item_to_facebook  # type: ignore
            post_item_to_facebook.delay(message, link)
            ok = True  # enqueued
        except Exception:
            use_celery = False  # fallback to direct
    err_msg = None
    if not use_celery:
        try:
            if want_image and (image_url or image_path):
                resp = post_photo_to_page(message, image_url=image_url, image_path=image_path)
            else:
                resp = post_to_page(message, link)
            sp.post_external_id = str(resp.get("id") or resp.get("post_id") or "")
            sp.status = "sent"
            sp.posted_at = datetime.utcnow()
            db.session.commit()
            ok = True
        except Exception as e:
            ok = False
            err_msg = str(e)
    if not ok:
        try:
            sp.status = "failed"
            db.session.commit()
        except Exception:
            db.session.rollback()
        return jsonify({
            "error": err_msg or "Posting to Facebook failed",
            "post": {
                "id": sp.id, "status": sp.status, "message": sp.message, "linkUrl": sp.link_url,
            }
        }), 502

    return jsonify({
        "post": {
            "id": sp.id, "status": sp.status, "message": sp.message, "linkUrl": sp.link_url,
            "postExternalId": sp.post_external_id, "postedAt": sp.posted_at.isoformat() if sp.posted_at else None,
        }
    }), 201


@bp.post("/posts/<int:post_id>/retry")
def retry_post(post_id: int):
    sp: SocialPost | None = SocialPost.query.get(post_id)
    if not sp:
        return jsonify({"error": "Post not found"}), 404
    item = sp.item
    if not sp.message and item is not None:
        msg, link = _build_message_for_item(item)
        sp.message = msg
        if not sp.link_url:
            sp.link_url = link
        db.session.commit()

    ok = False
    force_direct = str(request.args.get("direct", "")).strip() in {"1", "true", "yes", "on"}
    use_celery = bool(os.getenv("CELERY_BROKER_URL")) and not force_direct
    if use_celery:
        try:
            from ...tasks.jobs.social import post_item_to_facebook  # type: ignore
            post_item_to_facebook.delay(sp.message or "", sp.link_url)
            ok = True
        except Exception:
            use_celery = False
    err_msg = None
    if not use_celery:
        try:
            # Ensure link is valid before retry; otherwise send without link
            def _is_public_http_url(u: str | None) -> bool:
                if not u:
                    return False
                try:
                    p = urlparse(u)
                except Exception:
                    return False
                if p.scheme not in {"http", "https"} or not p.netloc:
                    return False
                host = p.hostname or ""
                if host in {"localhost", "127.0.0.1", "::1"}:
                    return False
                return True

            safe_link = sp.link_url if _is_public_http_url(sp.link_url) else None
            # Try image if available on the item
            image_url: str | None = None
            image_path: str | None = None
            if sp.item and getattr(sp.item, 'photo_url', None):
                photo = sp.item.photo_url
                base_frontend = os.getenv("FRONTEND_PUBLIC_BASE_URL") or os.getenv("PUBLIC_WEB_BASE_URL") or (request.host_url.rstrip('/') if request else None)
                if photo.startswith("/") and base_frontend and _is_public_http_url(base_frontend):
                    image_url = urljoin(base_frontend + "/", photo.lstrip("/"))
                elif _is_public_http_url(photo):
                    image_url = photo
                if not image_url:
                    try:
                        from ...config import get_config
                        cfg = get_config(None)
                        uploads = getattr(cfg, 'UPLOAD_FOLDER', None)
                        if uploads:
                            fname = os.path.basename(photo)
                            candidate = os.path.join(uploads, fname)
                            if os.path.isfile(candidate):
                                image_path = candidate
                    except Exception:
                        pass

            if image_url or image_path:
                resp = post_photo_to_page(sp.message or "", image_url=image_url, image_path=image_path)
            else:
                resp = post_to_page(sp.message or "", safe_link)
            sp.post_external_id = str(resp.get("id") or resp.get("post_id") or "")
            sp.status = "sent"
            sp.posted_at = datetime.utcnow()
            db.session.commit()
            ok = True
        except Exception as e:
            ok = False
            err_msg = str(e)
    if not ok:
        try:
            sp.status = "failed"
            db.session.commit()
        except Exception:
            db.session.rollback()
        return jsonify({"error": err_msg or "Retry failed", "post": {"id": sp.id, "status": sp.status}}), 502
    return jsonify({
        "post": {
            "id": sp.id, "status": sp.status, "message": sp.message, "linkUrl": sp.link_url,
            "postExternalId": sp.post_external_id, "postedAt": sp.posted_at.isoformat() if sp.posted_at else None,
        }
    })

from __future__ import annotations

from datetime import datetime, date
from typing import Iterable

from flask import Blueprint, jsonify, request

from ...extensions import db
from ...models.item import Item
from ...models.claim import Claim
from ...models.match import Match
from ...models.user import User
from ...models.claim import Claim
from ...models.notification import Notification
from ...models.app_setting import AppSetting
try:
    from ..notifications.bus import publish as publish_notif  # type: ignore
except Exception:  # pragma: no cover
    def publish_notif(user_id: int, event: dict):  # type: ignore
        return None

bp = Blueprint("admin", __name__, url_prefix="/admin")


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except Exception:
            continue
    return None


def _derive_ui_status(item: Item, claims_by_item: dict[int, list[Claim]] | None = None, matches_by_item: dict[int, list[Match]] | None = None) -> str:
    # Returned takes precedence
    if (item.status or "").lower() == "closed":
        return "returned"

    claims = (claims_by_item or {}).get(int(item.id), [])
    # Order of precedence: approved -> rejected -> pending
    for c in claims:
        if (c.status or "").lower() == "approved":
            return "claim_approved"
    for c in claims:
        if (c.status or "").lower() == "rejected":
            return "claim_rejected"
    for c in claims:
        if (c.status or "").lower() in {"requested", "verified"}:
            return "claim_pending"

    # Matched if explicitly matched or there are active matches
    if (item.status or "").lower() == "matched":
        return "matched"
    ms = (matches_by_item or {}).get(int(item.id), [])
    for m in ms:
        if (m.status or "").lower() in {"pending", "confirmed"}:
            return "matched"

    # Default
    return "unclaimed"


def _item_to_admin_dict(item: Item, ui_status: str) -> dict:
    thumb_url = getattr(item, "photo_thumb_url", None)
    if not thumb_url and item.photo_url:
        try:
            if "/uploads/" in item.photo_url:
                thumb_url = item.photo_url.replace("/uploads/", "/uploads/thumbs/", 1)
        except Exception:
            thumb_url = None

    reporter = item.reporter
    reporter_name = None
    if reporter:
        parts = [getattr(reporter, "first_name", None), getattr(reporter, "last_name", None)]
        reporter_name = " ".join([p for p in parts if p]) or getattr(reporter, "name", None)

    return {
        "id": item.id,
        "type": item.type,
        "title": item.title,
        "description": item.description,
        "location": item.location,
        "occurredOn": item.occurred_on.isoformat() if item.occurred_on else None,
        "reportedAt": item.reported_at.isoformat() if item.reported_at else None,
        "status": item.status,
        "uiStatus": ui_status,
        "photoUrl": item.photo_url,
        "photoThumbUrl": thumb_url,
        "reporterUserId": item.reporter_user_id,
        "reporter": {
            "id": reporter.id if reporter else None,
            "email": getattr(reporter, "email", None) if reporter else None,
            "firstName": getattr(reporter, "first_name", None) if reporter else None,
            "lastName": getattr(reporter, "last_name", None) if reporter else None,
            "studentId": getattr(reporter, "student_id", None) if reporter else None,
        } if reporter else None,
    }


@bp.get("/items")
def admin_list_items():
    """Admin search and filter for items with derived UI status.

    Query params:
      - q: text search in title/description/location/reporter email/name
      - type: lost|found
      - uiStatus: unclaimed|matched|claim_pending|claim_approved|claim_rejected|returned
      - dateFrom, dateTo: filter by occurred_on (preferred) falling in range; fallback to reported_at
      - reporter: free text (name/email) filter on reporter
      - limit: default 200 (max 500)
    """
    q = (request.args.get("q") or "").strip()
    type_param = (request.args.get("type") or "").strip().lower()
    ui_status_filter = (request.args.get("uiStatus") or "").strip().lower()
    reporter_q = (request.args.get("reporter") or "").strip()
    date_from = _parse_date(request.args.get("dateFrom"))
    date_to = _parse_date(request.args.get("dateTo"))
    try:
        limit = int(request.args.get("limit", 200))
    except Exception:
        limit = 200
    limit = max(1, min(500, limit))

    # Base query with optional joins for reporter filtering
    qry = Item.query
    if type_param in ("lost", "found"):
        qry = qry.filter(Item.type == type_param)

    if q or reporter_q:
        qry = qry.outerjoin(User, User.id == Item.reporter_user_id)
        if reporter_q and not q:
            # Only reporter filter
            like = f"%{reporter_q}%"
            qry = qry.filter(
                db.or_(
                    User.email.ilike(like),
                    User.first_name.ilike(like),
                    User.last_name.ilike(like),
                    User.name.ilike(like),
                )
            )
        else:
            like = f"%{q}%"
            conds = [
                Item.title.ilike(like),
                Item.description.ilike(like),
                Item.location.ilike(like),
            ]
            if reporter_q:
                rlike = f"%{reporter_q}%"
                conds.append(User.email.ilike(rlike))
                conds.append(User.first_name.ilike(rlike))
                conds.append(User.last_name.ilike(rlike))
                conds.append(User.name.ilike(rlike))
            else:
                conds.extend([User.email.ilike(like), User.first_name.ilike(like), User.last_name.ilike(like), User.name.ilike(like)])
            qry = qry.filter(db.or_(*conds))

    if date_from or date_to:
        # Prefer occurred_on range when present; else reported_at datetime
        if date_from and date_to:
            qry = qry.filter(
                db.or_(
                    db.and_(Item.occurred_on.isnot(None), Item.occurred_on.between(date_from, date_to)),
                    db.and_(
                        Item.occurred_on.is_(None),
                        Item.reported_at.between(datetime.combine(date_from, datetime.min.time()), datetime.combine(date_to, datetime.max.time())),
                    ),
                )
            )
        elif date_from:
            qry = qry.filter(
                db.or_(
                    db.and_(Item.occurred_on.isnot(None), Item.occurred_on >= date_from),
                    db.and_(Item.occurred_on.is_(None), Item.reported_at >= datetime.combine(date_from, datetime.min.time())),
                )
            )
        elif date_to:
            qry = qry.filter(
                db.or_(
                    db.and_(Item.occurred_on.isnot(None), Item.occurred_on <= date_to),
                    db.and_(Item.occurred_on.is_(None), Item.reported_at <= datetime.combine(date_to, datetime.max.time())),
                )
            )

    rows: list[Item] = qry.order_by(Item.reported_at.desc()).limit(limit).all()
    ids = [int(r.id) for r in rows]

    # Prefetch claims and matches in bulk
    claims_by_item: dict[int, list[Claim]] = {}
    if ids:
        for c in Claim.query.filter(Claim.item_id.in_(ids)).all():
            claims_by_item.setdefault(int(c.item_id), []).append(c)
    matches_by_item: dict[int, list[Match]] = {}
    if ids:
        for m in (
            Match.query.filter(db.or_(Match.lost_item_id.in_(ids), Match.found_item_id.in_(ids))).all()
        ):
            matches_by_item.setdefault(int(m.lost_item_id), []).append(m)
            matches_by_item.setdefault(int(m.found_item_id), []).append(m)

    out = []
    for it in rows:
        ui_st = _derive_ui_status(it, claims_by_item, matches_by_item)
        out.append(_item_to_admin_dict(it, ui_st))

    if ui_status_filter:
        out = [x for x in out if (x.get("uiStatus") or "").lower() == ui_status_filter]

    return jsonify({"items": out, "count": len(out)})


@bp.get("/stats/daily")
def admin_stats_daily():
    """Daily snapshot stats for dashboard backward-compatibility.

    Returns: { newReports, pendingClaims, successfulReturns }
    - newReports: items reported today (by reported_at date)
    - pendingClaims: claims in requested/verified statuses
    - successfulReturns: items closed today (status 'closed' with updated_at or reported_at today)
    """
    from sqlalchemy import func, or_, and_, cast, Date

    # Today boundaries in DB date terms
    today = func.current_date()

    # Items reported today
    new_reports_q = db.session.query(func.count(Item.id)).filter(cast(Item.reported_at, Date) == today)
    new_reports = int(new_reports_q.scalar() or 0)

    # Pending claims (requested/verified)
    pending_claims_q = db.session.query(func.count(Claim.id)).filter(Claim.status.in_(["requested", "verified"]))
    pending_claims = int(pending_claims_q.scalar() or 0)

    # Successful returns: items closed today (based on updated_at when status is closed); fallback to reported_at date if updated_at missing
    successful_returns_q = db.session.query(func.count(Item.id)).filter(
        and_(
            Item.status == "closed",
            or_(
                cast(Item.updated_at, Date) == today,
                cast(Item.reported_at, Date) == today,
            ),
        )
    )
    successful_returns = int(successful_returns_q.scalar() or 0)

    return jsonify({
        "newReports": new_reports,
        "pendingClaims": pending_claims,
        "successfulReturns": successful_returns,
    })


@bp.get("/stats/overview")
def admin_stats_overview():
    """Overall counts used by Admin Dashboard summary cards.

    Returns: { lost, found, claimed, pending }
    - pending counts items not yet finalized (status 'open' or 'matched').
    """
    from sqlalchemy import func

    lost = int((db.session.query(func.count(Item.id)).filter(Item.type == "lost").scalar() or 0))
    found = int((db.session.query(func.count(Item.id)).filter(Item.type == "found").scalar() or 0))
    claimed = int((db.session.query(func.count(Item.id)).filter(Item.status == "claimed").scalar() or 0))
    pending = int((
        db.session.query(func.count(Item.id))
        .filter(Item.status.in_(["open", "matched"]))
        .scalar() or 0
    ))

    return jsonify({
        "lost": lost,
        "found": found,
        "claimed": claimed,
        "pending": pending,
    })


@bp.get("/stats/reports_series")
def admin_stats_reports_series():
    """Time series of daily reports (lost and found) for the last N days.

    Query: days=int (default 30, max 180)
    Returns: { points: [ { date: 'YYYY-MM-DD', lost: n, found: n, total: n } ] }
    """
    from sqlalchemy import func, cast, Date
    try:
        days = int(request.args.get("days", 30))
    except Exception:
        days = 30
    days = max(1, min(180, days))

    # Group counts by date and type
    date_col = cast(Item.reported_at, Date)
    rows = (
        db.session.query(date_col.label("d"), Item.type, func.count(Item.id))
        .filter(date_col >= func.current_date() - days)
        .group_by("d", Item.type)
        .order_by("d")
        .all()
    )
    # Build map: date -> {lost, found}
    by_date: dict[str, dict[str, int]] = {}
    for d, typ, cnt in rows:
        try:
            key = d.isoformat()
        except Exception:
            key = str(d)
        entry = by_date.setdefault(key, {"lost": 0, "found": 0})
        t = str(typ or "").lower()
        if t in ("lost", "found"):
            entry[t] = int(cnt or 0)

    # Ensure all days present for the period (sparse fill)
    from datetime import date as _date, timedelta as _timedelta
    today = _date.today()
    ordered_points = []
    for i in range(days, -1, -1):
        d = today - _timedelta(days=i)
        k = d.isoformat()
        entry = by_date.get(k, {"lost": 0, "found": 0})
        ordered_points.append({
            "date": k,
            "lost": int(entry.get("lost", 0)),
            "found": int(entry.get("found", 0)),
            "total": int(entry.get("lost", 0)) + int(entry.get("found", 0)),
        })

    return jsonify({"points": ordered_points})


@bp.patch("/items/<int:item_id>")
def admin_update_item(item_id: int):
    it: Item | None = Item.query.get(item_id)
    if not it:
        return jsonify({"error": "Item not found"}), 404
    data = request.get_json(silent=True) or {}

    title = (data.get("title") or None) if isinstance(data.get("title"), str) else None
    description = (data.get("description") or None) if isinstance(data.get("description"), str) else None
    location = (data.get("location") or None) if isinstance(data.get("location"), str) else None
    occurred_on = _parse_date(data.get("occurredOn") if isinstance(data.get("occurredOn"), str) else None)
    status_ui = (data.get("statusUi") or data.get("uiStatus") or "").strip().lower()

    if title is not None:
        it.title = title
    if description is not None:
        it.description = description
    if location is not None:
        it.location = location
    if occurred_on is not None:
        it.occurred_on = occurred_on

    # Map UI status to underlying item status when applicable
    if status_ui:
        if status_ui == "returned":
            it.status = "closed"
        elif status_ui == "matched":
            it.status = "matched"
        elif status_ui == "unclaimed":
            it.status = "open"
        # claim_* statuses are driven by Claim records; ignore here

    db.session.commit()

    # Recompute ui status and return
    ui_st = _derive_ui_status(it)
    return jsonify({"item": _item_to_admin_dict(it, ui_st)})


@bp.post("/items/<int:item_id>/return")
def admin_mark_returned(item_id: int):
    it: Item | None = Item.query.get(item_id)
    if not it:
        return jsonify({"error": "Item not found"}), 404
    it.status = "closed"
    # Notify the most recent approved claimant if any
    try:
        claim = (
            Claim.query
            .filter(Claim.item_id == item_id, Claim.status == "approved")
            .order_by(Claim.approved_at.desc().nullslast())
            .first()
        )
        if claim is not None:
            db.session.add(
                Notification(
                    user_id=claim.claimant_user_id,
                    channel="inapp",
                    title="Item returned",
                    body=f"Your item ‘{getattr(it, 'title', 'Item')}’ has been marked as returned.",
                    payload={"kind": "claim", "action": "returned", "itemId": int(item_id), "claimId": int(claim.id)},
                )
            )
    except Exception:
        pass
    db.session.commit()
    # Publish SSE best-effort
    try:
        if claim is not None:  # type: ignore[name-defined]
            recent = (
                Notification.query.filter_by(user_id=claim.claimant_user_id)  # type: ignore[name-defined]
                .order_by(Notification.created_at.desc()).limit(1).all()
            )
            for n in recent:
                if isinstance(n.payload, dict) and n.payload.get("kind") == "claim":
                    publish_notif(int(claim.claimant_user_id), {  # type: ignore[name-defined]
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
    ui_st = _derive_ui_status(it)
    return jsonify({"item": _item_to_admin_dict(it, ui_st)})


@bp.get("/settings")
def admin_get_settings():
    auto_post_fb = AppSetting.get_bool("social.facebook.auto_post", False)
    return jsonify({
        "settings": {
            "social": {
                "facebook": {
                    "autoPost": auto_post_fb,
                }
            }
        }
    })


@bp.patch("/settings")
def admin_update_settings():
    data = request.get_json(silent=True) or {}
    social = data.get("social") or {}
    fb = social.get("facebook") or {}
    changed: dict = {}
    if "autoPost" in fb:
        val = bool(fb.get("autoPost"))
        AppSetting.set_bool("social.facebook.auto_post", val)
        changed.setdefault("social", {}).setdefault("facebook", {})["autoPost"] = val
    if not changed:
        return jsonify({"error": "No recognized settings"}), 400
    return jsonify({"updated": changed})

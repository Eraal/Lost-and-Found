from __future__ import annotations

from flask import Blueprint, jsonify, request

from ...extensions import db
from ...models.match import Match
from ...models.item import Item
from ...models.notification import Notification

# Import scoring helpers to compute suggestions on-demand
try:
    from ..search.routes import (
        _candidate_query,
        _compose_text,
        _date_from_item,
        _idf,
        _score_pair,
        _tokenize,
    )
except Exception:
    _candidate_query = _compose_text = _date_from_item = _idf = _score_pair = _tokenize = None  # type: ignore

bp = Blueprint("matches", __name__, url_prefix="/matches")


def _item_to_dict(it: Item) -> dict:
    thumb_url = getattr(it, "photo_thumb_url", None)
    if not thumb_url and it.photo_url:
        try:
            if "/uploads/" in it.photo_url:
                thumb_url = it.photo_url.replace("/uploads/", "/uploads/thumbs/", 1)
        except Exception:
            thumb_url = None
    return {
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

def _match_to_dict(m: Match, include_items: bool = False) -> dict:
    base = {
        "id": m.id,
        "lostItemId": m.lost_item_id,
        "foundItemId": m.found_item_id,
        "score": float(m.score or 0),
        "status": m.status,
        "createdAt": m.created_at.isoformat() if m.created_at else None,
    }
    if include_items:
        # SQLAlchemy relationships are present (lost_item, found_item)
        base["lostItem"] = _item_to_dict(m.lost_item) if m.lost_item else None
        base["foundItem"] = _item_to_dict(m.found_item) if m.found_item else None
    return base


@bp.get("/suggestions")
def suggestions_for_item():
    """Compute smart suggestions for a specific item without persisting.

    Query params: itemId (required), limit (default 10), threshold (default 0.5)
    Returns: { suggestions: [ { lostItemId, foundItemId, score, candidate } ] }
    """
    if not all([_candidate_query, _compose_text, _date_from_item, _idf, _score_pair, _tokenize]):
        return jsonify({"error": "Suggestions unavailable"}), 503
    try:
        item_id = int(request.args.get("itemId"))
    except Exception:
        return jsonify({"error": "Invalid itemId"}), 400
    try:
        limit = int(request.args.get("limit", 10))
    except Exception:
        limit = 10
    try:
        threshold = float(request.args.get("threshold", 0.5))
    except Exception:
        threshold = 0.5

    base = Item.query.get(item_id)
    if not base:
        return jsonify({"error": "Item not found"}), 404
    opposite = "found" if base.type == "lost" else "lost"
    base_text = _compose_text(base)
    base_loc = base.location
    base_date = _date_from_item(base)

    candidates = list(_candidate_query(opposite_type=opposite, location=base_loc, around=base_date))
    docs = [_tokenize(base_text)] + [_tokenize(_compose_text(it)) for it in candidates]
    idf = _idf(docs)

    out = []
    for it in candidates:
        s = _score_pair(base_text, _compose_text(it), base_loc, it.location, base_date, _date_from_item(it), idf)
        if s >= threshold:
            lost_id = base.id if base.type == "lost" else it.id
            found_id = it.id if base.type == "lost" else base.id
            out.append({
                "lostItemId": lost_id,
                "foundItemId": found_id,
                "score": round(float(s) * 100.0, 2),
                "candidate": _item_to_dict(it),
            })
    out.sort(key=lambda x: x["score"], reverse=True)
    return jsonify({"suggestions": out[: max(1, min(50, limit))]})


@bp.get("")
def list_matches():
    # Optional filters: lostItemId, foundItemId, status
    q = Match.query
    lost_id = request.args.get("lostItemId")
    found_id = request.args.get("foundItemId")
    status = request.args.get("status")
    include_items = request.args.get("includeItems") in ("1", "true", "yes")
    # optional limit
    try:
        limit = int(request.args.get("limit", 200))
    except Exception:
        limit = 200
    if lost_id:
        try:
            q = q.filter(Match.lost_item_id == int(lost_id))
        except Exception:
            return jsonify({"error": "Invalid lostItemId"}), 400
    if found_id:
        try:
            q = q.filter(Match.found_item_id == int(found_id))
        except Exception:
            return jsonify({"error": "Invalid foundItemId"}), 400
    if status:
        q = q.filter(Match.status == status)

    if include_items:
        # eager load items to reduce queries
        # Using joinedload would be better, but simple access triggers load per row which is acceptable for small lists
        pass
    rows = q.order_by(Match.created_at.desc()).limit(max(1, min(500, limit))).all()
    return jsonify({"matches": [_match_to_dict(m, include_items) for m in rows]})


@bp.post("")
def create_or_update_match():
    """Idempotently create a pending match with score, or update score if exists."""
    data = request.get_json(silent=True) or {}
    try:
        lost_id = int(data.get("lostItemId"))
        found_id = int(data.get("foundItemId"))
    except Exception:
        return jsonify({"error": "lostItemId and foundItemId must be integers"}), 400
    score = float(data.get("score") or 0)

    # Ensure items exist and types are correct
    lost = Item.query.get(lost_id)
    found = Item.query.get(found_id)
    if not lost or not found or lost.type != "lost" or found.type != "found":
        return jsonify({"error": "Invalid lost/found item ids"}), 400

    existing = Match.query.filter_by(lost_item_id=lost_id, found_item_id=found_id).first()
    if existing:
        existing.score = score
        db.session.commit()
        return jsonify({"match": _match_to_dict(existing)})
    m = Match(lost_item_id=lost_id, found_item_id=found_id, score=score)
    db.session.add(m)
    db.session.commit()
    return jsonify({"match": _match_to_dict(m)}), 201


@bp.post("/<int:match_id>/confirm")
def confirm_match(match_id: int):
    m = Match.query.get(match_id)
    if not m:
        return jsonify({"error": "Match not found"}), 404
    m.status = "confirmed"
    # Update related item statuses if still open
    for item_id in (m.lost_item_id, m.found_item_id):
        it = Item.query.get(item_id)
        if it and it.status in ("open", "matched"):
            it.status = "matched"
    db.session.commit()
    return jsonify({"match": _match_to_dict(m)})


@bp.post("/<int:match_id>/dismiss")
def dismiss_match(match_id: int):
    m = Match.query.get(match_id)
    if not m:
        return jsonify({"error": "Match not found"}), 404
    m.status = "dismissed"
    db.session.commit()
    return jsonify({"match": _match_to_dict(m)})

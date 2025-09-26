from flask import Blueprint, jsonify, request
from sqlalchemy import func, or_
from werkzeug.security import check_password_hash, generate_password_hash

from ...extensions import db
from ...models.user import User
from ...models.item import Item
from ...models.claim import Claim
from ...models.notification import Notification


bp = Blueprint("users", __name__, url_prefix="/users")


def _user_to_dict(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "studentId": u.student_id,
        "firstName": u.first_name,
        "middleName": u.middle_name,
        "lastName": u.last_name,
        "role": u.role,
        "lastLoginAt": u.last_login_at.isoformat() if u.last_login_at else None,
        "createdAt": u.created_at.isoformat() if u.created_at else None,
        "updatedAt": u.updated_at.isoformat() if u.updated_at else None,
    }


@bp.get("")
def list_users():
    """List users with optional filtering and search, returning related counts.

    Query params:
    - q: search across email, studentId, first/last name
    - role: 'student' | 'admin'
    - limit: page size (default 50, max 200)
    - offset: offset for pagination (default 0)
    """
    q = (request.args.get("q") or "").strip()
    role = (request.args.get("role") or "").strip() or None
    try:
        limit = min(max(int(request.args.get("limit", 50)), 1), 200)
    except Exception:
        limit = 50
    try:
        offset = max(int(request.args.get("offset", 0)), 0)
    except Exception:
        offset = 0

    # Subqueries for counts
    sub_items = (
        db.session.query(Item.reporter_user_id.label("uid"), func.count(Item.id).label("items_count"))
        .group_by(Item.reporter_user_id)
        .subquery()
    )
    sub_claims = (
        db.session.query(Claim.claimant_user_id.label("uid"), func.count(Claim.id).label("claims_count"))
        .group_by(Claim.claimant_user_id)
        .subquery()
    )
    sub_unread = (
        db.session.query(
            Notification.user_id.label("uid"),
            func.count(Notification.id).label("unread_count"),
        )
        .filter(Notification.status != "read")
        .group_by(Notification.user_id)
        .subquery()
    )

    base = (
        db.session.query(
            User,
            sub_items.c.items_count,
            sub_claims.c.claims_count,
            sub_unread.c.unread_count,
        )
        .outerjoin(sub_items, sub_items.c.uid == User.id)
        .outerjoin(sub_claims, sub_claims.c.uid == User.id)
        .outerjoin(sub_unread, sub_unread.c.uid == User.id)
    )

    if role in ("student", "admin"):
        base = base.filter(User.role == role)
    if q:
        like = f"%{q.lower()}%"
        base = base.filter(
            or_(
                func.lower(User.email).like(like),
                func.lower(func.coalesce(User.student_id, "")).like(like),
                func.lower(func.coalesce(User.first_name, "")).like(like),
                func.lower(func.coalesce(User.last_name, "")).like(like),
            )
        )

    total = base.count()
    rows = (
        base.order_by(func.coalesce(User.updated_at, User.created_at).desc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    users = []
    for u, items_count, claims_count, unread_count in rows:
        d = _user_to_dict(u)
        d.update(
            {
                "itemsReported": int(items_count or 0),
                "claimsMade": int(claims_count or 0),
                "unreadNotifications": int(unread_count or 0),
            }
        )
        users.append(d)

    return jsonify({"users": users, "total": total, "limit": limit, "offset": offset})


@bp.get("/<int:user_id>")
def get_user(user_id: int):
    u = User.query.get(user_id)
    if not u:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"user": _user_to_dict(u)})


@bp.patch("/<int:user_id>")
def update_user(user_id: int):
    u = User.query.get(user_id)
    if not u:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True) or {}

    # Editable profile fields
    if "firstName" in data:
        v = (data.get("firstName") or "").strip() or None
        u.first_name = v
    if "middleName" in data:
        v = (data.get("middleName") or "").strip() or None
        u.middle_name = v
    if "lastName" in data:
        v = (data.get("lastName") or "").strip() or None
        u.last_name = v
    if "studentId" in data:
        v = (data.get("studentId") or "").strip() or None
        # Optional update; respect uniqueness at DB level
        u.student_id = v
    if "email" in data:
        v = (data.get("email") or "").strip().lower() or None
        if not v or "@" not in v:
            return jsonify({"error": "Valid email is required"}), 400
        # Ensure email uniqueness
        exists = User.query.filter(User.email == v, User.id != u.id).first()
        if exists:
            return jsonify({"error": "Email already in use"}), 409
        u.email = v
    if "role" in data:
        v = (data.get("role") or "").strip()
        if v not in ("student", "admin"):
            return jsonify({"error": "Invalid role"}), 400
        u.role = v

    # Password change (optional)
    current_password = data.get("currentPassword") or None
    new_password = data.get("newPassword") or None
    if new_password is not None:
        if not current_password:
            return jsonify({"error": "Current password is required to set a new password"}), 400
        if not u.password_hash or not check_password_hash(u.password_hash, current_password):
            return jsonify({"error": "Current password is incorrect"}), 400
        if len(new_password) < 8:
            return jsonify({"error": "New password must be at least 8 characters"}), 400
        u.password_hash = generate_password_hash(new_password)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        # Likely uniqueness violation on student_id or other DB error
        return jsonify({"error": "Unable to update profile", "details": str(e)}), 400

    return jsonify({"user": _user_to_dict(u)})

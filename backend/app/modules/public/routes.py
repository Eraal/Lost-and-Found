from __future__ import annotations

from flask import Blueprint, jsonify

from ...extensions import db
from ...models.item import Item

bp = Blueprint("public", __name__, url_prefix="/public")


@bp.get("/stats/monthly")
def public_stats_monthly():
    """Public stats used on the landing page.

    Returns: { recoveredThisMonth: number }
    recoveredThisMonth counts items marked as returned (status='closed') whose
    updated_at (or reported_at as a fallback) falls within the current month.
    """
    from sqlalchemy import func, or_, and_, cast, Date

    # Start of current month to today
    month_start = func.date_trunc('month', func.now())

    q = db.session.query(func.count(Item.id)).filter(
        and_(
            Item.status == "closed",
            or_(
                cast(Item.updated_at, Date) >= cast(month_start, Date),
                cast(Item.reported_at, Date) >= cast(month_start, Date),
            ),
        )
    )
    recovered = int(q.scalar() or 0)
    return jsonify({"recoveredThisMonth": recovered})

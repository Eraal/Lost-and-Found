from __future__ import annotations

from flask import Blueprint, jsonify, request, Response, stream_with_context
import json
import time
from queue import Empty
from ...models.notification import Notification
from ...extensions import db
from .bus import subscribe, unsubscribe

bp = Blueprint("notifications", __name__, url_prefix="/notifications")


def _notif_to_dict(n: Notification) -> dict:
    return {
        "id": n.id,
        "userId": n.user_id,
        "channel": n.channel,
        "title": n.title,
        "message": n.body,
        "payload": n.payload,
        "status": n.status,
    "read": bool(n.read_at),
        "createdAt": n.created_at.isoformat() if n.created_at else None,
        "sentAt": n.sent_at.isoformat() if n.sent_at else None,
        "readAt": n.read_at.isoformat() if n.read_at else None,
    }


@bp.get("")
def list_notifications():
    user_id = request.args.get("userId")
    if not user_id:
        return jsonify({"error": "userId required"}), 400
    try:
        uid = int(user_id)
    except Exception:
        return jsonify({"error": "Invalid userId"}), 400
    try:
        limit = int(request.args.get("limit", 20))
    except Exception:
        limit = 20
    rows = (
        Notification.query
        .filter(Notification.user_id == uid)
        .order_by(Notification.created_at.desc())
        .limit(max(1, min(100, limit)))
        .all()
    )
    return jsonify({"notifications": [_notif_to_dict(n) for n in rows]})


@bp.patch("/<int:notif_id>/read")
def mark_read(notif_id: int):
    n = Notification.query.get(notif_id)
    if not n:
        return jsonify({"error": "Not found"}), 404
    # Optional: require userId match from query for basic safety
    user_id_param = request.args.get("userId")
    if user_id_param:
        try:
            uid = int(user_id_param)
            if n.user_id != uid:
                return jsonify({"error": "Forbidden"}), 403
        except Exception:
            return jsonify({"error": "Invalid userId"}), 400
    if not n.read_at:
        from datetime import datetime
        n.read_at = datetime.utcnow()
        # also flip status to 'read' if such enum exists
        try:
            n.status = "read"
        except Exception:
            pass
        db.session.add(n)
        db.session.commit()
    return jsonify({"notification": _notif_to_dict(n)})


@bp.get("/stream")
def stream_notifications():
    """Server-Sent Events stream for a user's notifications.

    Client subscribes with /notifications/stream?userId=<id>
    """
    user_id = request.args.get("userId")
    if not user_id:
        return jsonify({"error": "userId required"}), 400
    try:
        uid = int(user_id)
    except Exception:
        return jsonify({"error": "Invalid userId"}), 400

    q = subscribe(uid)

    def event_stream():
        try:
            # Initial comment to establish stream
            yield ": connected\n\n"
            while True:
                try:
                    # Keep below gunicorn's timeout to ensure periodic yields
                    evt = q.get(timeout=15)
                except Empty:
                    # Keep-alive
                    yield "event: ping\n" + f"data: {json.dumps({'ts': int(time.time())})}\n\n"
                    continue
                yield "event: notification\n" + f"data: {json.dumps(evt)}\n\n"
        finally:
            unsubscribe(uid, q)

    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return Response(stream_with_context(event_stream()), headers=headers)


from flask import Blueprint, jsonify, request, g
from ...extensions import db
from ...models.item import Item
from ...models.user import User
from ...models.claim import Claim
from ...models.match import Match
from ...models.notification import Notification
from ...models.audit_log import AuditLog
from datetime import datetime, timezone

# Best-effort SSE publisher (optional)
try:
    from ..notifications.bus import publish as publish_notif  # type: ignore
except Exception:  # pragma: no cover
    def publish_notif(user_id: int, event: dict):  # type: ignore
        return None

bp = Blueprint("claims", __name__, url_prefix="/claims")


def _json_error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def _status_label(internal: str | None) -> str | None:
    if not internal:
        return None
    m = {
        "requested": "Pending Claim",
        "verified": "Under Review",
        "approved": "Approved",
        "rejected": "Rejected",
        "cancelled": "Cancelled",
    }
    return m.get(internal.lower(), internal)


def _is_admin() -> bool:
    try:
        u = getattr(g, "current_user", None)
        if not u:
            return False
        role = getattr(u, "role", None)
        # Handle both string and enum representations
        role_str = str(role).lower() if role else ""
        return role_str == "admin"
    except Exception:
        return False


def _current_user_id() -> int | None:
    try:
        uid = getattr(g, "current_user_id", None)
        return int(uid) if uid is not None else None
    except Exception:
        return None


@bp.post("")
def create_claim():
    # Require authenticated user context (from bearer token in production or dev header)
    current_uid = getattr(g, "current_user_id", None)
    if not current_uid:
        return _json_error("Authentication required", 401)
    data = request.get_json(silent=True) or {}
    try:
        item_id = int(data.get("itemId"))
    except (TypeError, ValueError):
        return _json_error("Invalid itemId", 400)

    notes = (data.get("notes") or "").strip() or None

    item = Item.query.get(item_id)
    if not item:
        return _json_error("Item not found", 404)
    if item.type != "found":
        return _json_error("Only found items can be claimed", 400)

    user = User.query.get(int(current_uid))
    if not user:
        return _json_error("Claimant not found", 404)

    # Prevent duplicate claim by same user for the same item
    existing = Claim.query.filter_by(item_id=item.id, claimant_user_id=user.id).first()
    if existing:
        return _json_error("You have already requested a claim for this item", 409)

    claim = Claim(item_id=item.id, claimant_user_id=user.id, notes=notes)
    db.session.add(claim)
    db.session.commit()

    return (
        jsonify(
            {
                "claim": {
                    "id": claim.id,
                    "itemId": claim.item_id,
                    "claimantId": claim.claimant_user_id,
                    "status": claim.status,
                    "statusLabel": _status_label(claim.status),
                    "createdAt": claim.created_at.isoformat() if claim.created_at else None,
                }
            }
        ),
        201,
    )


@bp.get("")
def list_claims():
    """List claims with optional filters.

    Query params:
      - claimantId: int
      - itemId: int
      - status: str (accepts 'pending' alias for 'requested')
      - limit: int (default 200)
    Returns minimal fields for backward compatibility plus nested item/user details.
    """
    claimant_id = request.args.get("claimantId")
    item_id = request.args.get("itemId")
    status = request.args.get("status")
    returned_only = False
    limit = request.args.get("limit")

    q = Claim.query
    # Privacy: students may only see their own claims regardless of filters supplied.
    current_uid = _current_user_id()
    if current_uid and not _is_admin():
        q = q.filter(Claim.claimant_user_id == current_uid)
    if claimant_id:
        try:
            q = q.filter(Claim.claimant_user_id == int(claimant_id))
        except (TypeError, ValueError):
            return _json_error("Invalid claimantId", 400)
    if item_id:
        try:
            q = q.filter(Claim.item_id == int(item_id))
        except (TypeError, ValueError):
            return _json_error("Invalid itemId", 400)
    if status:
        norm = status.lower()
        if norm == "pending":
            norm = "requested"
        if norm == "returned":
            # Virtual filter handled after fetching
            returned_only = True
        else:
            q = q.filter(Claim.status == norm)

    try:
        lim = int(limit) if limit is not None else 200
    except (TypeError, ValueError):
        return _json_error("Invalid limit", 400)

    claims = (
        q.order_by(Claim.created_at.desc())
        .limit(lim)
        .all()
    )
    if returned_only:
        claims = [c for c in claims if c.item and getattr(c.item, 'status', None) == 'closed']

    # Prefetch per-item best match score and per-user claim stats for enrichment
    item_ids = list({int(c.item_id) for c in claims})
    user_ids = list({int(c.claimant_user_id) for c in claims})

    best_score_by_item: dict[int, float] = {}
    if item_ids:
        # A claim can be for a found item most of the time; compute best score regardless of orientation
        rows = (
            db.session.query(Match.lost_item_id, Match.found_item_id, Match.score)
            .filter(db.or_(Match.lost_item_id.in_(item_ids), Match.found_item_id.in_(item_ids)))
            .all()
        )
        for lost_id, found_id, score in rows:
            try:
                s = float(score or 0)
            except Exception:
                s = 0.0
            for iid in (int(lost_id), int(found_id)):
                if iid in item_ids:
                    if iid not in best_score_by_item or s > best_score_by_item[iid]:
                        best_score_by_item[iid] = s

    user_stats: dict[int, dict] = {}
    if user_ids:
        # Aggregate claims per user by status
        agg = (
            db.session.query(Claim.claimant_user_id, Claim.status, db.func.count().label("cnt"))
            .filter(Claim.claimant_user_id.in_(user_ids))
            .group_by(Claim.claimant_user_id, Claim.status)
            .all()
        )
        for uid, status_val, cnt in agg:
            uid = int(uid)
            st = (status_val or "").lower()
            entry = user_stats.setdefault(uid, {"total": 0, "approved": 0, "rejected": 0, "pending": 0})
            entry["total"] += int(cnt or 0)
            if st in {"requested", "verified"}:
                entry["pending"] += int(cnt or 0)
            elif st == "approved":
                entry["approved"] += int(cnt or 0)
            elif st == "rejected":
                entry["rejected"] += int(cnt or 0)

    # Prefetch latest admin notes AND return claimer info from audit logs (best-effort, non-fatal)
    admin_notes_by_claim: dict[int, str] = {}
    return_claimer_by_claim: dict[int, dict] = {}
    if claims:
        claim_ids = [int(c.id) for c in claims]
        related_item_ids = [int(c.item_id) for c in claims]
        # Claim logs for notes
        claim_logs = (
            AuditLog.query
            .filter(AuditLog.entity_type == "claim", AuditLog.entity_id.in_(claim_ids))
            .order_by(AuditLog.created_at.desc())
            .limit(len(claim_ids) * 3)
            .all()
        )
        for log in claim_logs:
            try:
                if int(log.entity_id) in admin_notes_by_claim:
                    continue  # keep most recent already stored
                det = log.details or {}
                if isinstance(det, dict):
                    note = det.get("adminNote") or det.get("admin_note")
                    if isinstance(note, str) and note.strip():
                        admin_notes_by_claim[int(log.entity_id)] = note.strip()
            except Exception:
                continue

        # Item return logs capture claimer info (action=item_returned, entity_type=item)
        if related_item_ids:
            return_logs = (
                AuditLog.query
                .filter(
                    AuditLog.entity_type == "item",
                    AuditLog.entity_id.in_(related_item_ids),
                    AuditLog.action == "item_returned",
                )
                .order_by(AuditLog.created_at.desc())
                .limit(len(related_item_ids) * 3)  # heuristic to avoid large scans
                .all()
            )
            for log in return_logs:
                try:
                    det = log.details or {}
                    if not isinstance(det, dict):
                        continue
                    cid = det.get("claimId")
                    if cid is None:
                        continue
                    cid_int = int(cid)
                    # Keep only the latest (first in desc order)
                    if cid_int in return_claimer_by_claim:
                        continue
                    return_claimer_by_claim[cid_int] = {
                        "returnClaimerUserId": det.get("claimerUserId"),
                        "returnClaimerName": det.get("claimerName"),
                        "returnOverride": bool(det.get("overridden")),
                    }
                except Exception:
                    continue

    def claim_to_dict(c: Claim):
        item = c.item
        user = c.claimant
        reporter = None
        try:
            reporter = getattr(item, 'reporter', None) if item else None
        except Exception:
            reporter = None
        best_score = best_score_by_item.get(int(c.item_id))
        stats = user_stats.get(int(c.claimant_user_id))
        admin_note = admin_notes_by_claim.get(int(c.id))
        rc = return_claimer_by_claim.get(int(c.id)) or {}
        returned_flag = bool(item and getattr(item, 'status', None) == 'closed')
        status_label = _status_label(c.status)
        if returned_flag:
            status_label = 'Returned'
        return {
            "id": c.id,
            "itemId": c.item_id,
            "claimantId": c.claimant_user_id,
            "status": c.status,
            "statusLabel": status_label,
            "returned": returned_flag,
            "createdAt": c.created_at.isoformat() if c.created_at else None,
            "approvedAt": c.approved_at.isoformat() if c.approved_at else None,
            "notes": c.notes,
            "adminNote": admin_note,
            **({
                "returnClaimerUserId": rc.get("returnClaimerUserId"),
                "returnClaimerName": rc.get("returnClaimerName"),
                "returnOverride": rc.get("returnOverride"),
            } if rc else {}),
            # enrichment
            "matchScore": best_score,
            # enrich
            "item": {
                "id": item.id if item else None,
                "type": getattr(item, "type", None),
                "title": getattr(item, "title", None),
                "location": getattr(item, "location", None),
                "status": getattr(item, "status", None),
                "photoUrl": getattr(item, "photo_url", None),
                **({
                    "reporter": {
                        "id": getattr(reporter, 'id', None),
                        "email": getattr(reporter, 'email', None),
                        "firstName": getattr(reporter, 'first_name', None),
                        "lastName": getattr(reporter, 'last_name', None),
                        "studentId": getattr(reporter, 'student_id', None),
                    }
                } if reporter else {}),
            } if item else None,
            "user": {
                "id": user.id if user else None,
                "email": getattr(user, "email", None),
                "firstName": getattr(user, "first_name", None),
                "lastName": getattr(user, "last_name", None),
                "studentId": getattr(user, "student_id", None),
                "stats": stats,
            } if user else None,
        }

    return jsonify({"claims": [claim_to_dict(c) for c in claims]})


@bp.patch("/<int:claim_id>")
def update_claim_status(claim_id: int):
    """Update a claim's status.

    Body JSON: { status: 'pending' | 'approved' | 'rejected', notes?: str, adminId?: int }
    'pending' maps to internal 'requested'.
    """
    claim: Claim | None = Claim.query.get(claim_id)
    if not claim:
        return _json_error("Claim not found", 404)

    # Authorization: only admins may approve / reject; claimant may only transition back to pending (requested)
    current_uid = _current_user_id()
    is_admin = _is_admin()
    if not is_admin and (not current_uid or current_uid != claim.claimant_user_id):
        return _json_error("Not authorized to modify this claim", 403)

    data = request.get_json(silent=True) or {}
    status = (data.get("status") or "").lower().strip()
    # Student's original note lives in claim.notes. For admin notes, prefer 'adminNotes' and keep claim.notes intact.
    raw_admin_notes = data.get("adminNotes")
    admin_notes = (raw_admin_notes or "").strip() if isinstance(raw_admin_notes, str) else None
    notes = (data.get("notes") or "").strip() or None
    admin_id = data.get("adminId")

    if status not in {"pending", "approved", "rejected"}:
        return _json_error("Invalid status. Use pending, approved, or rejected.", 400)
    # Non-admins can only set pending (requested)
    if not is_admin and status != "pending":
        return _json_error("Only administrators can approve or reject claims", 403)

    new_status = "requested" if status == "pending" else status
    # Prevent duplicate approvals to support frontend hiding 'Approve' button
    if claim.status == "approved" and new_status == "approved":
        return _json_error("Claim already approved", 409)

    # Update fields
    prev_status = claim.status
    claim.status = new_status
    # Only overwrite claim.notes if no explicit adminNotes is provided; this preserves student's note.
    if admin_notes:
        pass
    elif notes is not None:
        claim.notes = notes
    if isinstance(admin_id, int):
        # set the admin verifier; do not enforce role check here to keep this module self-contained
        claim.admin_verifier_id = admin_id
    # set approved_at only when approved
    claim.approved_at = datetime.now(timezone.utc) if new_status == "approved" else None

    # Update underlying item state and create notifications on transitions
    item = claim.item
    user = claim.claimant
    reporter = None
    try:
        reporter = getattr(item, 'reporter', None) if item else None
    except Exception:
        reporter = None
    # If already returned (item closed), surface claimer info from return audit log
    return_info = None
    try:
        if item and getattr(item, "status", None) == "closed":
            log = (
                AuditLog.query
                .filter(
                    AuditLog.entity_type == "item",
                    AuditLog.entity_id == int(item.id),
                    AuditLog.action == "item_returned",
                )
                .order_by(AuditLog.created_at.desc())
                .first()
            )
            if log and isinstance(log.details, dict) and log.details.get("claimId") == int(claim.id):
                return_info = {
                    "returnClaimerUserId": log.details.get("claimerUserId"),
                    "returnClaimerName": log.details.get("claimerName"),
                    "returnOverride": bool(log.details.get("overridden")),
                }
    except Exception:
        return_info = None
    default_admin_note: str | None = None
    if new_status == "approved" and item is not None:
        try:
            item.status = "claimed"
        except Exception:
            pass
        # Notify claimant
        try:
            db.session.add(
                Notification(
                    user_id=claim.claimant_user_id,
                    channel="inapp",
                    title="Claim approved",
                    body=f"Your request for ‘{getattr(item, 'title', 'the item')}’ is approved. Please proceed to the office to claim the item.",
                    payload={
                        "kind": "claim",
                        "action": "approved",
                        "itemId": int(claim.item_id),
                        "claimId": int(claim.id),
                    },
                )
            )
        except Exception:
            pass
        # If no explicit admin note provided, record a default instructional note
        if not admin_notes:
            default_admin_note = "Your request is approved. Please proceed to the office to claim the item."
    elif new_status == "rejected" and item is not None:
        # Notify claimant
        try:
            db.session.add(
                Notification(
                    user_id=claim.claimant_user_id,
                    channel="inapp",
                    title="Claim rejected",
                    body=f"Your claim for ‘{getattr(item, 'title', 'the item')}’ was rejected.",
                    payload={
                        "kind": "claim",
                        "action": "rejected",
                        "itemId": int(claim.item_id),
                        "claimId": int(claim.id),
                    },
                )
            )
        except Exception:
            pass
    elif new_status == "requested" and item is not None and prev_status != new_status:
        # Notify claimant when status transitions back (or to) pending/requested
        try:
            db.session.add(
                Notification(
                    user_id=claim.claimant_user_id,
                    channel="inapp",
                    title="Claim pending review",
                    body=f"Your claim for ‘{getattr(item, 'title', 'the item')}’ is pending admin review.",
                    payload={
                        "kind": "claim",
                        "action": "pending",
                        "itemId": int(claim.item_id),
                        "claimId": int(claim.id),
                    },
                )
            )
        except Exception:
            pass

    # Record admin note and status change in audit log if provided
    if admin_notes or default_admin_note:
        try:
            db.session.add(
                AuditLog(
                    actor_user_id=admin_id if isinstance(admin_id, int) else None,
                    action="claim_status_update",
                    entity_type="claim",
                    entity_id=int(claim.id),
                    details={
                        "fromStatus": prev_status,
                        "toStatus": new_status,
                        "adminNote": admin_notes or default_admin_note,
                    },
                )
            )
        except Exception:
            pass
        # Ensure response includes the note even if defaulted
        if not admin_notes:
            admin_notes = default_admin_note

    db.session.commit()

    # Publish SSE events for notifications best-effort
    try:
        if user is not None:
            # Stream only the most recent 1 claim-related notification (the one we just inserted)
            recent = (
                Notification.query.filter_by(user_id=claim.claimant_user_id)
                .order_by(Notification.created_at.desc()).limit(1).all()
            )
            for n in recent:
                if isinstance(n.payload, dict) and n.payload.get("kind") == "claim":
                    publish_notif(int(claim.claimant_user_id), {
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

    item = claim.item
    user = claim.claimant

    returned_flag = bool(item and getattr(item, 'status', None) == 'closed')
    status_label = _status_label(claim.status)
    if returned_flag:
        status_label = 'Returned'
    return jsonify({
        "claim": {
            "id": claim.id,
            "itemId": claim.item_id,
            "claimantId": claim.claimant_user_id,
            "status": claim.status,
            "statusLabel": status_label,
            "returned": returned_flag,
            "createdAt": claim.created_at.isoformat() if claim.created_at else None,
            "approvedAt": claim.approved_at.isoformat() if claim.approved_at else None,
            "notes": claim.notes,
            "adminNote": admin_notes,
            **(return_info or {}),
            "item": {
                "id": item.id if item else None,
                "type": getattr(item, "type", None),
                "title": getattr(item, "title", None),
                "location": getattr(item, "location", None),
                "status": getattr(item, "status", None),
                "photoUrl": getattr(item, "photo_url", None),
                **({
                    "reporter": {
                        "id": getattr(reporter, 'id', None),
                        "email": getattr(reporter, 'email', None),
                        "firstName": getattr(reporter, 'first_name', None),
                        "lastName": getattr(reporter, 'last_name', None),
                        "studentId": getattr(reporter, 'student_id', None),
                    }
                } if reporter else {}),
            } if item else None,
            "user": {
                "id": user.id if user else None,
                "email": getattr(user, "email", None),
                "firstName": getattr(user, "first_name", None),
                "lastName": getattr(user, "last_name", None),
                "studentId": getattr(user, "student_id", None),
            } if user else None,
        }
    })


@bp.post("/<int:claim_id>/return")
def mark_claim_returned(claim_id: int):
    """Mark the item associated with this claim as returned (complete the cycle).

    This sets the underlying item's status to 'closed' and notifies the claimant.
    """
    claim: Claim | None = Claim.query.get(claim_id)
    if not claim:
        return _json_error("Claim not found", 404)

    item = claim.item
    if not item:
        return _json_error("Associated item not found", 404)

    # Only admins may mark an approved claim as returned; claim must be in approved state
    if not _is_admin():
        return _json_error("Only administrators can mark items as returned", 403)
    if claim.status != "approved":
        return _json_error("Only approved claims can be returned", 400)

    try:
        item.status = "closed"
    except Exception:
        pass

    # Optional override of claimer details (e.g. different student picks up on behalf)
    override_user = None
    override_name: str | None = None
    try:
        payload = request.get_json(silent=True) or {}
        override_uid_raw = payload.get("claimerUserId") or payload.get("overrideClaimerUserId")
        override_name_raw = payload.get("claimerName") or payload.get("overrideClaimerName")
        if override_uid_raw is not None:
            try:
                override_uid = int(override_uid_raw)
                if override_uid != claim.claimant_user_id:
                    from ...models.user import User  # local import
                    override_user = User.query.get(override_uid)
            except Exception:
                override_user = None
        if isinstance(override_name_raw, str) and override_name_raw.strip():
            override_name = override_name_raw.strip()
    except Exception:
        pass

    # Notify claimant about return completion
    try:
        db.session.add(
            Notification(
                user_id=claim.claimant_user_id,
                channel="inapp",
                title="Item returned",
                body=f"Your item ‘{getattr(item, 'title', 'Item')}’ has been marked as returned.",
                payload={
                    "kind": "claim",
                    "action": "returned",
                    "itemId": int(claim.item_id),
                    "claimId": int(claim.id),
                },
            )
        )
    except Exception:
        pass

    # Audit log with claimer snapshot
    try:
        claimer_user = override_user or claim.claimant
        claimer_name = override_name
        if not claimer_name and claimer_user:
            parts = [getattr(claimer_user, 'first_name', None), getattr(claimer_user, 'last_name', None)]
            claimer_name = " ".join([p for p in parts if p]) or getattr(claimer_user, 'email', None)
        db.session.add(
            AuditLog(
                actor_user_id=_current_user_id(),
                action="item_returned",
                entity_type="item",
                entity_id=int(item.id),
                details={
                    "claimId": int(claim.id),
                    "claimerUserId": int((override_user.id if override_user else claim.claimant_user_id)),
                    "claimerName": claimer_name,
                    "overridden": bool(override_user and override_user.id != claim.claimant_user_id) or bool(override_name),
                },
            )
        )
    except Exception:
        pass

    db.session.commit()

    # Publish SSE best-effort
    try:
        recent = (
            Notification.query.filter_by(user_id=claim.claimant_user_id)
            .order_by(Notification.created_at.desc()).limit(1).all()
        )
        for n in recent:
            if isinstance(n.payload, dict) and n.payload.get("kind") == "claim":
                publish_notif(int(claim.claimant_user_id), {
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

    # Snapshot of claimer for immediate UI update
    claimer_user = override_user or claim.claimant
    claimer_name = override_name
    if not claimer_name and claimer_user:
        parts = [getattr(claimer_user, 'first_name', None), getattr(claimer_user, 'last_name', None)]
        claimer_name = " \u2009".join([p for p in parts if p]) or getattr(claimer_user, 'email', None)
    returned_flag = bool(item and getattr(item, 'status', None) == 'closed')
    status_label = _status_label(claim.status)
    if returned_flag:
        status_label = 'Returned'
    reporter = None
    try:
        reporter = getattr(item, 'reporter', None) if item else None
    except Exception:
        reporter = None
    return jsonify({
        "claim": {
            "id": claim.id,
            "itemId": claim.item_id,
            "claimantId": claim.claimant_user_id,
            "status": claim.status,
            "statusLabel": status_label,
            "returned": returned_flag,
            "createdAt": claim.created_at.isoformat() if claim.created_at else None,
            "approvedAt": claim.approved_at.isoformat() if claim.approved_at else None,
            "notes": claim.notes,
            "claimerUserId": int((override_user.id if override_user else claim.claimant_user_id)),
            "claimerName": claimer_name,
            "returnOverride": bool(override_user and override_user.id != claim.claimant_user_id) or bool(override_name),
            "item": {
                "id": item.id if item else None,
                "type": getattr(item, "type", None),
                "title": getattr(item, "title", None),
                "location": getattr(item, "location", None),
                "status": getattr(item, "status", None),
                "photoUrl": getattr(item, "photo_url", None),
                **({
                    "reporter": {
                        "id": getattr(reporter, 'id', None),
                        "email": getattr(reporter, 'email', None),
                        "firstName": getattr(reporter, 'first_name', None),
                        "lastName": getattr(reporter, 'last_name', None),
                        "studentId": getattr(reporter, 'student_id', None),
                    }
                } if reporter else {}),
            } if item else None,
        }
    })


@bp.get("/<int:claim_id>")
def get_claim(claim_id: int):
    """Fetch a single claim with enrichment similar to list/update responses.

    Returns 404 if not found.
    """
    claim: Claim | None = Claim.query.get(claim_id)
    if not claim:
        return _json_error("Claim not found", 404)

    # Privacy: student can only fetch own claim
    if not _is_admin():
        current_uid = _current_user_id()
        if not current_uid or current_uid != claim.claimant_user_id:
            return _json_error("Claim not found", 404)  # hide existence

    # Enrich match score (best) for the related item
    best_score: float | None = None
    try:
        rows = (
            db.session.query(Match.lost_item_id, Match.found_item_id, Match.score)
            .filter(db.or_(Match.lost_item_id == claim.item_id, Match.found_item_id == claim.item_id))
            .all()
        )
        for lost_id, found_id, score in rows:
            try:
                s = float(score or 0)
            except Exception:
                s = 0.0
            if best_score is None or s > best_score:
                best_score = s
    except Exception:
        pass

    # Latest admin note via audit log
    admin_note: str | None = None
    try:
        log = (
            AuditLog.query
            .filter(AuditLog.entity_type == "claim", AuditLog.entity_id == int(claim.id))
            .order_by(AuditLog.created_at.desc())
            .first()
        )
        if log and isinstance(log.details, dict):
            note = log.details.get("adminNote") or log.details.get("admin_note")
            if isinstance(note, str) and note.strip():
                admin_note = note.strip()
    except Exception:
        pass

    item = claim.item
    user = claim.claimant
    reporter = None
    try:
        reporter = getattr(item, 'reporter', None) if item else None
    except Exception:
        reporter = None
    # Return claimer snapshot if item was returned
    return_info = None
    try:
        if item and getattr(item, "status", None) == "closed":
            log = (
                AuditLog.query
                .filter(
                    AuditLog.entity_type == "item",
                    AuditLog.entity_id == int(item.id),
                    AuditLog.action == "item_returned",
                )
                .order_by(AuditLog.created_at.desc())
                .first()
            )
            if log and isinstance(log.details, dict) and log.details.get("claimId") == int(claim.id):
                return_info = {
                    "returnClaimerUserId": log.details.get("claimerUserId"),
                    "returnClaimerName": log.details.get("claimerName"),
                    "returnOverride": bool(log.details.get("overridden")),
                }
    except Exception:
        return_info = None
    returned_flag = bool(item and getattr(item, 'status', None) == 'closed')
    status_label = _status_label(claim.status)
    if returned_flag:
        status_label = 'Returned'
    return jsonify({
        "claim": {
            "id": claim.id,
            "itemId": claim.item_id,
            "claimantId": claim.claimant_user_id,
            "status": claim.status,
            "statusLabel": status_label,
            "returned": returned_flag,
            "createdAt": claim.created_at.isoformat() if claim.created_at else None,
            "approvedAt": claim.approved_at.isoformat() if claim.approved_at else None,
            "notes": claim.notes,
            "adminNote": admin_note,
            "matchScore": best_score,
            **(return_info or {}),
            "item": {
                "id": item.id if item else None,
                "type": getattr(item, "type", None),
                "title": getattr(item, "title", None),
                "location": getattr(item, "location", None),
                "status": getattr(item, "status", None),
                "photoUrl": getattr(item, "photo_url", None),
                **({
                    "reporter": {
                        "id": getattr(reporter, 'id', None),
                        "email": getattr(reporter, 'email', None),
                        "firstName": getattr(reporter, 'first_name', None),
                        "lastName": getattr(reporter, 'last_name', None),
                        "studentId": getattr(reporter, 'student_id', None),
                    }
                } if reporter else {}),
            } if item else None,
            "user": {
                "id": user.id if user else None,
                "email": getattr(user, "email", None),
                "firstName": getattr(user, "first_name", None),
                "lastName": getattr(user, "last_name", None),
                "studentId": getattr(user, "student_id", None),
            } if user else None,
        }
    })

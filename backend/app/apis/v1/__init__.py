from flask import Blueprint, Flask, g, request, current_app

from ...modules.items.routes import bp as items_bp
from ...modules.claims.routes import bp as claims_bp
from ...modules.auth import bp as auth_bp
from ...modules.search.routes import bp as search_bp
from ...modules.matches.routes import bp as matches_bp
from ...modules.users.routes import bp as users_bp
from ...modules.notifications.routes import bp as notifications_bp
from ...modules.admin.routes import bp as admin_bp
from ...modules.social.routes import bp as social_bp
from ...modules.qrcodes.routes import bp as qrcodes_bp
from ...modules.public.routes import bp as public_bp


def register_api(app: Flask) -> None:
    api_v1 = Blueprint("api_v1", __name__, url_prefix="/api/v1")

    # Lightweight auth context loader with production-safe behavior.
    # In development (DEBUG=True) we accept either an `X-User-Id` header or an
    # `Authorization: User <id>` header to simplify local testing.
    # In production (DEBUG=False), require a signed bearer token issued by our app.
    @api_v1.before_request  # type: ignore
    def _load_current_user():  # pragma: no cover - simple request context helper
        from ...models.user import User  # local import to avoid circulars
        from ...security import verify_token
        uid: int | None = None
        role: str | None = None
        debug_mode = bool(current_app.config.get("DEBUG"))

        # Bearer token takes precedence
        auth = request.headers.get("Authorization") or ""
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
            tuid, trole = verify_token(token)
            uid, role = tuid, trole
        elif debug_mode:
            # Dev-only header shortcuts
            raw = request.headers.get("X-User-Id") or ""
            if not raw and auth.lower().startswith("user "):
                raw = auth[5:].strip()
            if raw:
                try:
                    cand = int(raw)
                    if cand > 0:
                        uid = cand
                except Exception:
                    uid = None
        user_obj = None
        if uid is not None:
            try:
                user_obj = User.query.get(uid)
            except Exception:
                user_obj = None
        # Optionally attach role override from token
        if user_obj is not None and role:
            try:
                setattr(user_obj, "role", role)
            except Exception:
                pass
        g.current_user = user_obj  # type: ignore[attr-defined]
        g.current_user_id = getattr(user_obj, 'id', None) if user_obj else None  # type: ignore[attr-defined]

    # Mount feature blueprints
    api_v1.register_blueprint(items_bp)
    api_v1.register_blueprint(auth_bp)
    api_v1.register_blueprint(claims_bp)
    api_v1.register_blueprint(search_bp)
    api_v1.register_blueprint(matches_bp)
    api_v1.register_blueprint(users_bp)
    api_v1.register_blueprint(notifications_bp)
    api_v1.register_blueprint(admin_bp)
    api_v1.register_blueprint(social_bp)
    api_v1.register_blueprint(qrcodes_bp)
    api_v1.register_blueprint(public_bp)

    app.register_blueprint(api_v1)

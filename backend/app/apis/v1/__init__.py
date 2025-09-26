from flask import Blueprint, Flask

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


def register_api(app: Flask) -> None:
    api_v1 = Blueprint("api_v1", __name__, url_prefix="/api/v1")

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

    app.register_blueprint(api_v1)

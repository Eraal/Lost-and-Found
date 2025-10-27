import os
from flask import Flask, send_from_directory, abort
from .config import get_config
from .extensions import db, migrate, cors
from sqlalchemy import text
from dotenv import load_dotenv
from werkzeug.middleware.proxy_fix import ProxyFix


def create_app(config_name: str | None = None) -> Flask:
    app = Flask(__name__)

    # Load config
    # Ensure .env is loaded before reading env vars
    load_dotenv()
    app.config.from_object(get_config(config_name))

    # Honor proxy headers from Nginx for correct url_for(_external=True) scheme/host
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)  # type: ignore[assignment]

    # Init extensions
    cors.init_app(app)
    db.init_app(app)
    migrate.init_app(app, db)

    # Register blueprints (v1 API)
    from .apis.v1 import register_api
    register_api(app)

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.get("/db-check")
    def db_check() -> dict:
        # Lazy import to avoid circulars
        try:
            db.session.execute(text("SELECT 1"))
            return {"db": "ok"}
        except Exception as e:
            return {"db": "error", "message": str(e)}, 500

    # Ensure upload folder exists and serve uploads
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    @app.get("/uploads/<path:filename>")
    def uploads(filename: str):
        """Serve uploaded files. Falls back to legacy path if needed.

        Primary path: app.config['UPLOAD_FOLDER'] (e.g., /opt/app/uploads)
        Legacy fallback: /opt/app/backend/uploads (used by older builds)
        """
        # Primary location
        base = app.config["UPLOAD_FOLDER"]
        primary_path = os.path.join(base, filename)
        if os.path.isfile(primary_path):
            return send_from_directory(base, filename)

        # Legacy location (when previous default used os.getcwd() under backend)
        legacy_base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
        legacy_path = os.path.join(legacy_base, filename)
        if os.path.isfile(legacy_path):
            return send_from_directory(legacy_base, filename)

        # Not found in any known location
        abort(404)

    return app

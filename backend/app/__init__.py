import os
from flask import Flask, send_from_directory
from .config import get_config
from .extensions import db, migrate, cors
from sqlalchemy import text
from dotenv import load_dotenv


def create_app(config_name: str | None = None) -> Flask:
    app = Flask(__name__)

    # Load config
    # Ensure .env is loaded before reading env vars
    load_dotenv()
    app.config.from_object(get_config(config_name))

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
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

    return app

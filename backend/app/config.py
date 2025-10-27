import os
from dataclasses import dataclass

# Resolve project base directory robustly (backend/app -> backend -> repo root)
_HERE = os.path.dirname(__file__)
_BASE_DIR = os.path.abspath(os.path.join(_HERE, "..", ".."))


@dataclass
class BaseConfig:
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me")
    SQLALCHEMY_DATABASE_URI: str = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/lostfound")
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False
    JSON_SORT_KEYS: bool = False
    # File uploads: default to repo-level /uploads to be stable across WorkingDirectory
    UPLOAD_FOLDER: str = os.getenv("UPLOAD_FOLDER", os.path.join(_BASE_DIR, "uploads"))
    MAX_CONTENT_LENGTH: int = int(os.getenv("MAX_CONTENT_LENGTH", str(10 * 1024 * 1024)))  # 10 MB
    # External URL scheme preference (affects url_for(..., _external=True))
    PREFERRED_URL_SCHEME: str = os.getenv("PREFERRED_URL_SCHEME", "https" if os.getenv("FLASK_ENV") == "production" else "http")
    # Optional AWS S3
    S3_BUCKET_NAME: str | None = os.getenv("S3_BUCKET_NAME") or None
    S3_REGION: str | None = os.getenv("S3_REGION") or None
    S3_ENDPOINT_URL: str | None = os.getenv("S3_ENDPOINT_URL") or None  # for S3-compatible storage
    S3_ACCESS_KEY_ID: str | None = os.getenv("S3_ACCESS_KEY_ID") or None
    S3_SECRET_ACCESS_KEY: str | None = os.getenv("S3_SECRET_ACCESS_KEY") or None
    # If provided, we will construct URLs as f"{S3_PUBLIC_URL_BASE}/{key}". Otherwise, use AWS default URL.
    S3_PUBLIC_URL_BASE: str | None = os.getenv("S3_PUBLIC_URL_BASE") or None


@dataclass
class DevelopmentConfig(BaseConfig):
    DEBUG: bool = True


@dataclass
class ProductionConfig(BaseConfig):
    DEBUG: bool = False


CONFIG_MAP = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
}


def get_config(name: str | None):
    if not name:
        name = os.getenv("FLASK_ENV", "development")
    return CONFIG_MAP.get(name, DevelopmentConfig)()

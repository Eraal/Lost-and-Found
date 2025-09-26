from __future__ import annotations

from datetime import datetime
from ..extensions import db
from sqlalchemy import text


class AppSetting(db.Model):
    __tablename__ = "app_settings"

    id = db.Column(db.BigInteger, primary_key=True)
    key = db.Column(db.String(200), nullable=False, unique=True, index=True)
    value_text = db.Column(db.Text, nullable=True)
    updated_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    @staticmethod
    def get(key: str, default: str | None = None) -> str | None:
        try:
            row = AppSetting.query.filter_by(key=key).first()
            return row.value_text if row else default
        except Exception:
            # Table may not exist yet; return default
            return default

    @staticmethod
    def set(key: str, value: str | None) -> None:
        try:
            row = AppSetting.query.filter_by(key=key).first()
            if row is None:
                row = AppSetting(key=key, value_text=value)
                db.session.add(row)
            else:
                row.value_text = value
            db.session.commit()
        except Exception:
            # Best-effort: attempt to create table if missing, then retry once
            try:
                db.session.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS app_settings (
                            id BIGSERIAL PRIMARY KEY,
                            key VARCHAR(200) UNIQUE NOT NULL,
                            value_text TEXT NULL,
                            updated_at TIMESTAMPTZ NULL
                        );
                        CREATE UNIQUE INDEX IF NOT EXISTS uq_app_settings_key ON app_settings(key);
                        """
                    )
                )
                db.session.commit()
                # retry
                row = AppSetting.query.filter_by(key=key).first()
                if row is None:
                    row = AppSetting(key=key, value_text=value)
                    db.session.add(row)
                else:
                    row.value_text = value
                db.session.commit()
            except Exception:
                db.session.rollback()

    @staticmethod
    def get_bool(key: str, default: bool = False) -> bool:
        val = AppSetting.get(key, None)
        if val is None:
            return default
        return str(val).strip().lower() in {"1", "true", "yes", "on"}

    @staticmethod
    def set_bool(key: str, value: bool) -> None:
        AppSetting.set(key, "true" if value else "false")

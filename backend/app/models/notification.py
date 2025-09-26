from sqlalchemy import Index, func
from sqlalchemy.dialects.postgresql import JSONB
from ..extensions import db
from .enums import notification_channel_enum, notification_status_enum


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.BigInteger, primary_key=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    channel = db.Column(notification_channel_enum, nullable=False)
    title = db.Column(db.String(200))
    body = db.Column(db.Text)
    payload = db.Column(JSONB)
    status = db.Column(notification_status_enum, nullable=False, server_default="queued")
    sent_at = db.Column(db.DateTime(timezone=True))
    read_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    user = db.relationship("User", back_populates="notifications")

    __table_args__ = (
        Index("idx_notifications_user_status", "user_id", "status"),
    )

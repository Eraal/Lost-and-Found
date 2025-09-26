from sqlalchemy import Index, func
from sqlalchemy.dialects.postgresql import INET, JSONB
from ..extensions import db


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.BigInteger, primary_key=True)
    actor_user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="SET NULL"))
    action = db.Column(db.String(120), nullable=False)
    entity_type = db.Column(db.String(120), nullable=False)
    entity_id = db.Column(db.BigInteger, nullable=False)
    details = db.Column(JSONB)
    ip_address = db.Column(INET)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    actor = db.relationship("User", back_populates="audit_logs", foreign_keys=[actor_user_id])

    __table_args__ = (
        Index("idx_audit_entity", "entity_type", "entity_id"),
        Index("idx_audit_created_at", "created_at"),
    )

from sqlalchemy import UniqueConstraint, func, Index
from ..extensions import db
from .enums import match_status_enum


class Match(db.Model):
    __tablename__ = "matches"

    id = db.Column(db.BigInteger, primary_key=True)
    lost_item_id = db.Column(db.BigInteger, db.ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    found_item_id = db.Column(db.BigInteger, db.ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    score = db.Column(db.Numeric(5, 2), nullable=False, server_default="0.00")
    status = db.Column(match_status_enum, nullable=False, server_default="pending")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    lost_item = db.relationship("Item", foreign_keys=[lost_item_id], back_populates="lost_matches")
    found_item = db.relationship("Item", foreign_keys=[found_item_id], back_populates="found_matches")

    __table_args__ = (
        UniqueConstraint("lost_item_id", "found_item_id", name="uq_matches_lost_found"),
        Index("idx_matches_lost", "lost_item_id"),
        Index("idx_matches_found", "found_item_id"),
    )

from sqlalchemy import func, UniqueConstraint, Index
from ..extensions import db
from .enums import claim_status_enum


class Claim(db.Model):
    __tablename__ = "claims"

    id = db.Column(db.BigInteger, primary_key=True)
    item_id = db.Column(db.BigInteger, db.ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    claimant_user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = db.Column(claim_status_enum, nullable=False, server_default="requested")
    admin_verifier_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="SET NULL"))
    notes = db.Column(db.Text)
    approved_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    # Relationships
    item = db.relationship("Item", back_populates="claims")
    claimant = db.relationship("User", back_populates="claims", foreign_keys=[claimant_user_id])
    admin_verifier = db.relationship("User", back_populates="verified_claims", foreign_keys=[admin_verifier_id])

    __table_args__ = (
        UniqueConstraint("item_id", "claimant_user_id", name="uq_claims_item_claimant"),
        Index("idx_claims_item", "item_id"),
        Index("idx_claims_claimant", "claimant_user_id"),
        Index("idx_claims_status", "status"),
    )

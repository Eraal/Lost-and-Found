from sqlalchemy import func
from sqlalchemy.dialects.postgresql import JSONB
from ..extensions import db


class QRCode(db.Model):
    __tablename__ = "qr_codes"

    id = db.Column(db.BigInteger, primary_key=True)
    code = db.Column(db.String(120), unique=True, nullable=False)
    owner_user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="SET NULL"))
    item_id = db.Column(db.BigInteger, db.ForeignKey("items.id", ondelete="SET NULL"))
    scan_count = db.Column(db.Integer, nullable=False, server_default="0")
    last_scanned_at = db.Column(db.DateTime(timezone=True))
    meta = db.Column(JSONB)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    owner = db.relationship("User", back_populates="qr_codes", foreign_keys=[owner_user_id])
    item = db.relationship("Item", back_populates="qr_codes")

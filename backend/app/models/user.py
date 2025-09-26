from sqlalchemy import func
from ..extensions import db
from .enums import role_enum


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.BigInteger, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    # Legacy full name field (kept for backward compatibility)
    name = db.Column(db.String(120))
    # New structured identity fields
    student_id = db.Column(db.String(50), unique=True, nullable=True)
    first_name = db.Column(db.String(120), nullable=True)
    middle_name = db.Column(db.String(120), nullable=True)
    last_name = db.Column(db.String(120), nullable=True)
    role = db.Column(role_enum, nullable=False, server_default="student")
    password_hash = db.Column(db.Text)
    last_login_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    # Relationships
    reported_items = db.relationship(
        "Item",
        back_populates="reporter",
        foreign_keys="Item.reporter_user_id",
        lazy=True,
    )
    claims = db.relationship(
        "Claim",
        back_populates="claimant",
        foreign_keys="Claim.claimant_user_id",
        lazy=True,
    )
    verified_claims = db.relationship(
        "Claim",
        back_populates="admin_verifier",
        foreign_keys="Claim.admin_verifier_id",
        lazy=True,
    )
    notifications = db.relationship(
        "Notification",
        back_populates="user",
        lazy=True,
        cascade="all, delete-orphan",
    )
    qr_codes = db.relationship(
        "QRCode",
        back_populates="owner",
        foreign_keys="QRCode.owner_user_id",
        lazy=True,
    )
    audit_logs = db.relationship(
        "AuditLog",
        back_populates="actor",
        foreign_keys="AuditLog.actor_user_id",
        lazy=True,
    )

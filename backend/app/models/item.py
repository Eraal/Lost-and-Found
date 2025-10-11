from sqlalchemy import func, Index, literal_column
from sqlalchemy.dialects.postgresql import REGCONFIG
from ..extensions import db
from .enums import item_type_enum, item_status_enum


class Item(db.Model):
    __tablename__ = "items"

    id = db.Column(db.BigInteger, primary_key=True)
    reporter_user_id = db.Column(db.BigInteger, db.ForeignKey("users.id", ondelete="SET NULL"))
    type = db.Column(item_type_enum, nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    location = db.Column(db.String(200))
    occurred_on = db.Column(db.Date)
    reported_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())
    status = db.Column(item_status_enum, nullable=False, server_default="open")
    photo_url = db.Column(db.String(512))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    # Relationships
    reporter = db.relationship("User", back_populates="reported_items", foreign_keys=[reporter_user_id])
    claims = db.relationship("Claim", back_populates="item", cascade="all, delete-orphan")
    lost_matches = db.relationship(
        "Match",
        back_populates="lost_item",
        foreign_keys="Match.lost_item_id",
        cascade="all, delete-orphan",
    )
    found_matches = db.relationship(
        "Match",
        back_populates="found_item",
        foreign_keys="Match.found_item_id",
        cascade="all, delete-orphan",
    )
    social_posts = db.relationship("SocialPost", back_populates="item", cascade="all, delete-orphan")
    qr_codes = db.relationship("QRCode", back_populates="item")

    __table_args__ = (
        Index("idx_items_type_status", "type", "status"),
        Index("idx_items_location", "location"),
        Index("idx_items_occurred_on", "occurred_on"),
        Index("idx_items_reported_at", "reported_at"),
        # Full-text search index over title + description using English dictionary
        Index(
            "idx_items_search_tsv",
            func.to_tsvector(
                literal_column("'english'").cast(REGCONFIG),
                func.coalesce(title, "") + " " + func.coalesce(description, ""),
            ),
            postgresql_using="gin",
        ),
    )

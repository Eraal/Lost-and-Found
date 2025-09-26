from sqlalchemy import UniqueConstraint, func
from ..extensions import db
from .enums import social_platform_enum, notification_status_enum


class SocialPost(db.Model):
    __tablename__ = "social_posts"

    id = db.Column(db.BigInteger, primary_key=True)
    item_id = db.Column(db.BigInteger, db.ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    platform = db.Column(social_platform_enum, nullable=False, server_default="facebook")
    post_external_id = db.Column(db.String(200))
    message = db.Column(db.Text)
    link_url = db.Column(db.String(512))
    status = db.Column(notification_status_enum, nullable=False, server_default="queued")
    posted_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=func.now())

    item = db.relationship("Item", back_populates="social_posts")

    __table_args__ = (
        UniqueConstraint("platform", "post_external_id", name="uq_social_posts_platform_external"),
    )

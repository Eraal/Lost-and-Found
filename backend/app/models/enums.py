from sqlalchemy.dialects.postgresql import ENUM

# Postgres ENUM types mapped for SQLAlchemy. These assume the types already exist in the DB.
# Set create_type=False to avoid SQLAlchemy trying to create them automatically.

role_enum = ENUM("student", "admin", name="role_enum", create_type=False)
item_type_enum = ENUM("lost", "found", name="item_type_enum", create_type=False)
item_status_enum = ENUM("open", "matched", "claimed", "closed", name="item_status_enum", create_type=False)
claim_status_enum = ENUM(
    "requested",
    "verified",
    "approved",
    "rejected",
    "cancelled",
    name="claim_status_enum",
    create_type=False,
)
match_status_enum = ENUM("pending", "confirmed", "dismissed", name="match_status_enum", create_type=False)
notification_channel_enum = ENUM("email", "push", "inapp", name="notification_channel_enum", create_type=False)
notification_status_enum = ENUM("queued", "sent", "failed", "read", name="notification_status_enum", create_type=False)
social_platform_enum = ENUM("facebook", name="social_platform_enum", create_type=False)

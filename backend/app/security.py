from __future__ import annotations

import os
from typing import Any, Optional, Tuple
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired


def _serializer() -> URLSafeTimedSerializer:
    secret = os.getenv("SECRET_KEY", "change-me")
    # Salt provides namespace isolation for tokens
    return URLSafeTimedSerializer(secret_key=secret, salt="auth-token")


def issue_token(user_id: int, role: str) -> str:
    """Issue a signed token for a user.

    Payload is minimal: {"id": int, "role": str}
    """
    s = _serializer()
    return s.dumps({"id": int(user_id), "role": str(role or "student")})


def verify_token(token: str) -> Tuple[Optional[int], Optional[str]]:
    """Verify a token and return (user_id, role) if valid, else (None, None).

    Max age configurable via AUTH_TOKEN_MAX_AGE seconds (default 30 days).
    """
    max_age_default = 60 * 60 * 24 * 30  # 30 days
    try:
        max_age = int(os.getenv("AUTH_TOKEN_MAX_AGE", str(max_age_default)))
    except Exception:
        max_age = max_age_default
    try:
        data = _serializer().loads(token, max_age=max_age)
        uid = int(data.get("id")) if isinstance(data, dict) and data.get("id") is not None else None
        role = str(data.get("role")) if isinstance(data, dict) and data.get("role") is not None else None
        return (uid, role)
    except (BadSignature, SignatureExpired, ValueError, TypeError):
        return (None, None)

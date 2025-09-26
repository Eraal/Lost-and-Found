from flask import request, jsonify
from sqlalchemy import func
from werkzeug.security import generate_password_hash, check_password_hash

from ...extensions import db
from ...models.user import User
from . import bp


def _json_error(message: str, status: int = 400):
    return jsonify({"error": message}), status


@bp.post("/register/student")
def register_student():
    data = request.get_json(silent=True) or {}

    # Extract and normalize
    student_id = (data.get("studentId") or data.get("student_id") or "").strip()
    email = (data.get("email") or "").strip().lower()
    first_name = (data.get("firstName") or data.get("first_name") or "").strip()
    middle_name = (data.get("middleName") or data.get("middle_name") or "").strip() or None
    last_name = (data.get("lastName") or data.get("last_name") or "").strip()
    password = data.get("password") or ""

    # Basic validation
    if not student_id:
        return _json_error("Student ID is required")
    if not first_name:
        return _json_error("First name is required")
    if not last_name:
        return _json_error("Last name is required")
    if not email or "@" not in email:
        return _json_error("Valid email is required")
    if not password or len(password) < 8:
        return _json_error("Password must be at least 8 characters")

    # Check duplicates
    existing_email = User.query.filter_by(email=email).first()
    if existing_email:
        return _json_error("Email already in use", 409)

    if student_id:
        existing_sid = User.query.filter_by(student_id=student_id).first()
        if existing_sid:
            return _json_error("Student ID already registered", 409)

    # Create user
    user = User(
        email=email,
        student_id=student_id,
        first_name=first_name,
        middle_name=middle_name,
        last_name=last_name,
        role="student",
        password_hash=generate_password_hash(password),
    )

    db.session.add(user)
    db.session.commit()

    return (
        jsonify(
            {
                "id": user.id,
                "email": user.email,
                "studentId": user.student_id,
                "firstName": user.first_name,
                "middleName": user.middle_name,
                "lastName": user.last_name,
                "role": user.role,
            }
        ),
        201,
    )


@bp.post("/register/admin")
def register_admin():
    """Create a new admin user. Intended to be called from Admin UI.

    Body JSON:
      - email: string (required)
      - firstName: string (required)
      - lastName: string (required)
      - middleName: string (optional)
      - password: string (required, min 8)
    """
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    first_name = (data.get("firstName") or data.get("first_name") or "").strip()
    middle_name = (data.get("middleName") or data.get("middle_name") or "").strip() or None
    last_name = (data.get("lastName") or data.get("last_name") or "").strip()
    password = data.get("password") or ""

    # Validation
    if not first_name:
        return _json_error("First name is required")
    if not last_name:
        return _json_error("Last name is required")
    if not email or "@" not in email:
        return _json_error("Valid email is required")
    if not password or len(password) < 8:
        return _json_error("Password must be at least 8 characters")

    # Uniqueness checks
    existing_email = User.query.filter_by(email=email).first()
    if existing_email:
        return _json_error("Email already in use", 409)

    # Create admin user
    user = User(
        email=email,
        first_name=first_name,
        middle_name=middle_name,
        last_name=last_name,
        role="admin",
        password_hash=generate_password_hash(password),
    )

    db.session.add(user)
    db.session.commit()

    return (
        jsonify(
            {
                "id": user.id,
                "email": user.email,
                "studentId": user.student_id,
                "firstName": user.first_name,
                "middleName": user.middle_name,
                "lastName": user.last_name,
                "role": user.role,
            }
        ),
        201,
    )


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or "@" not in email:
        return _json_error("Valid email is required")
    if not password:
        return _json_error("Password is required")

    user = User.query.filter_by(email=email).first()
    if not user or not user.password_hash or not check_password_hash(user.password_hash, password):
        return _json_error("Invalid email or password", 401)

    # Update last login timestamp
    try:
        user.last_login_at = func.now()
        db.session.commit()
    except Exception:
        db.session.rollback()

    return jsonify(
        {
            "id": user.id,
            "email": user.email,
            "studentId": user.student_id,
            "firstName": user.first_name,
            "middleName": user.middle_name,
            "lastName": user.last_name,
            "role": user.role,
        }
    )

from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
import os

# Flask extensions singletons

db = SQLAlchemy()
migrate = Migrate()

# Configure allowed origins from env (comma-separated). In production avoid wildcard.
# Determine allowed origins
_allowed = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
_origins = [o.strip() for o in _allowed.split(",") if o.strip()] if _allowed else []
if not _origins:
	# Fallback defaults for local development
	env = os.getenv("FLASK_ENV", "development").lower()
	if env != "production":
		_origins = [
			"http://localhost:5173",
			"http://127.0.0.1:5173",
			"http://localhost:3000",
			"http://127.0.0.1:3000",
		]
cors = CORS(resources={r"*": {"origins": _origins}})

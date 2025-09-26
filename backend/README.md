Backend (Flask) – Lost & Found System

Quick start
- Create virtualenv and install requirements
- Copy .env.example to .env and set DATABASE_URL
- Run Flask app

Features scaffolded
- API v1 mounted at /api/v1
- Items endpoints: GET /items, POST /items
- Health checks: /health, /db-check

Structure
- app/
  - apis/v1/           # versioned API mounting
  - modules/*          # items, claims, matches, social, qrcodes, etc.
  - extensions.py      # db, cors, migrate singletons
  - config.py          # env & settings
  - __init__.py        # app factory
- wsgi.py              # dev entrypoint
- requirements.txt
- .env.example

import os
from celery import Celery


def make_celery() -> Celery:
    broker = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
    backend = os.getenv("CELERY_RESULT_BACKEND", broker)
    app = Celery("lostfound", broker=broker, backend=backend, include=[
        "app.tasks.jobs.social",
    ])
    app.conf.update(task_track_started=True)
    return app

celery_app = make_celery()

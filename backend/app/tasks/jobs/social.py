from app.integrations.facebook.client import post_to_page
from app.tasks.celery_app import celery_app


@celery_app.task
def post_item_to_facebook(message: str, link: str | None = None) -> dict:
    return post_to_page(message, link)

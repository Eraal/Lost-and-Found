import os
import requests
try:
    # Local import to avoid heavy dependencies at import time if models not ready yet
    from app.models.app_setting import AppSetting  # type: ignore
except Exception:  # pragma: no cover
    AppSetting = None  # type: ignore

GRAPH_URL = "https://graph.facebook.com/v19.0"


def post_to_page(message: str, link: str | None = None, *, page_id: str | None = None, token: str | None = None) -> dict:
    # Resolve credentials: explicit args > env > app settings
    if not page_id:
        page_id = os.getenv("FACEBOOK_PAGE_ID") or (AppSetting.get("social.facebook.page_id") if AppSetting else None)
    if not token:
        token = os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN") or (AppSetting.get("social.facebook.page_access_token") if AppSetting else None)
    if not page_id or not token:
        raise RuntimeError("Facebook credentials are not configured")
    url = f"{GRAPH_URL}/{page_id}/feed"
    data = {"message": message}
    if link:
        data["link"] = link
    resp = requests.post(url, data=data, params={"access_token": token}, timeout=15)
    try:
        resp.raise_for_status()
    except requests.HTTPError as e:  # Surface FB error details to caller
        try:
            payload = resp.json()
            err = payload.get("error") or {}
            code = err.get("code")
            subcode = err.get("error_subcode")
            err_type = err.get("type")
            msg = err.get("message") or str(e)
            details = f"Facebook API error ({err_type} code={code} subcode={subcode}): {msg}"
        except Exception:
            details = f"HTTP {resp.status_code}: {resp.text[:500]}"
        raise RuntimeError(details) from e
    return resp.json()


def get_page_info(*, page_id: str | None = None, token: str | None = None) -> dict:
    """Fetch basic info for a Page to verify the ID/token are correct.

    Returns { id, name, link } on success. Raises RuntimeError with details on error.
    """
    if not page_id:
        page_id = os.getenv("FACEBOOK_PAGE_ID") or (AppSetting.get("social.facebook.page_id") if AppSetting else None)
    if not token:
        token = os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN") or (AppSetting.get("social.facebook.page_access_token") if AppSetting else None)
    if not page_id or not token:
        raise RuntimeError("Facebook credentials are not configured")
    url = f"{GRAPH_URL}/{page_id}"
    params = {"fields": "id,name,link", "access_token": token}
    resp = requests.get(url, params=params, timeout=15)
    try:
        resp.raise_for_status()
    except requests.HTTPError as e:
        try:
            payload = resp.json()
            err = payload.get("error") or {}
            code = err.get("code")
            subcode = err.get("error_subcode")
            err_type = err.get("type")
            msg = err.get("message") or str(e)
            details = f"Facebook API error ({err_type} code={code} subcode={subcode}): {msg}"
        except Exception:
            details = f"HTTP {resp.status_code}: {resp.text[:500]}"
        raise RuntimeError(details) from e
    return resp.json()


def post_photo_to_page(
    message: str,
    *,
    image_url: str | None = None,
    image_path: str | None = None,
    page_id: str | None = None,
    token: str | None = None,
) -> dict:
    """Post a photo to the Page with a caption.

    One of image_url (public http/https) or image_path (local readable file) must be provided.
    Returns the Graph response; raises RuntimeError on error with detailed message.
    """
    if not page_id:
        page_id = os.getenv("FACEBOOK_PAGE_ID") or (AppSetting.get("social.facebook.page_id") if AppSetting else None)
    if not token:
        token = os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN") or (AppSetting.get("social.facebook.page_access_token") if AppSetting else None)
    if not page_id or not token:
        raise RuntimeError("Facebook credentials are not configured")
    if not (image_url or image_path):
        raise RuntimeError("An image_url or image_path is required to post a photo")

    url = f"{GRAPH_URL}/{page_id}/photos"
    params = {"access_token": token}
    data = {"message": message} if message else {}
    files = None
    if image_url:
        data["url"] = image_url
    elif image_path:
        try:
            f = open(image_path, "rb")
        except FileNotFoundError as e:
            raise RuntimeError(f"Image file not found: {image_path}") from e
        except Exception as e:
            raise RuntimeError(f"Unable to open image file: {image_path}") from e
        files = {"source": (os.path.basename(image_path), f, "application/octet-stream")}
    resp = requests.post(url, params=params, data=data, files=files, timeout=30)
    try:
        resp.raise_for_status()
    except requests.HTTPError as e:
        try:
            payload = resp.json()
            err = payload.get("error") or {}
            code = err.get("code")
            subcode = err.get("error_subcode")
            err_type = err.get("type")
            msg = err.get("message") or str(e)
            details = f"Facebook API error ({err_type} code={code} subcode={subcode}): {msg}"
        except Exception:
            details = f"HTTP {resp.status_code}: {resp.text[:500]}"
        raise RuntimeError(details) from e
    return resp.json()

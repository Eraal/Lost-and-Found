from __future__ import annotations

from queue import Queue, Empty
from threading import Lock
from typing import Any, Dict, List

# Simple in-memory pub/sub for SSE. Not suitable for multi-process deployments.
_subs: dict[int, List[Queue]] = {}
_lock = Lock()


def subscribe(user_id: int) -> Queue:
    q: Queue = Queue()
    with _lock:
        _subs.setdefault(user_id, []).append(q)
    return q


def unsubscribe(user_id: int, q: Queue) -> None:
    with _lock:
        arr = _subs.get(user_id)
        if not arr:
            return
        try:
            arr.remove(q)
        except ValueError:
            pass
        if not arr:
            _subs.pop(user_id, None)


def publish(user_id: int, event: Dict[str, Any]) -> None:
    # Best-effort, drop if no subscribers
    with _lock:
        arr = list(_subs.get(user_id, []))
    for q in arr:
        try:
            q.put_nowait(event)
        except Exception:
            # ignore full/closed queues
            pass

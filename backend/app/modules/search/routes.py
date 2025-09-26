from __future__ import annotations

from datetime import date, datetime, timedelta
import math
import re
from typing import Iterable, List, Tuple, Dict

from flask import Blueprint, jsonify, request

from ...extensions import db
from ...models.item import Item
from ...models.match import Match

bp = Blueprint("search", __name__, url_prefix="/search")


# ---- Text utilities (lightweight TF-IDF + cosine) ----
_WORD_RE = re.compile(r"[A-Za-z0-9]+")
_STOP = {
    "the","a","an","and","or","to","for","in","on","at","of","with","is","are","was","were","it","this","that",
    "my","your","our","their","i","you","we","they","as","by","be","from","near","around","about","into",
}


def _tokenize(text: str | None) -> List[str]:
    if not text:
        return []
    words = [w.lower() for w in _WORD_RE.findall(text)]
    return [w for w in words if w not in _STOP and len(w) > 1]


def _tf(tokens: List[str]) -> Dict[str, float]:
    total = len(tokens) or 1
    freq: Dict[str, int] = {}
    for t in tokens:
        freq[t] = freq.get(t, 0) + 1
    return {k: v / total for k, v in freq.items()}


def _idf(docs: List[List[str]]) -> Dict[str, float]:
    # docs: list of token lists
    N = len(docs) or 1
    df: Dict[str, int] = {}
    for tokens in docs:
        for t in set(tokens):
            df[t] = df.get(t, 0) + 1
    return {t: math.log((N + 1) / (df_t + 1)) + 1.0 for t, df_t in df.items()}


def _cosine(vec1: Dict[str, float], vec2: Dict[str, float]) -> float:
    # Sparse cosine
    dot = 0.0
    for k, v in vec1.items():
        if k in vec2:
            dot += v * vec2[k]
    n1 = math.sqrt(sum(v * v for v in vec1.values()))
    n2 = math.sqrt(sum(v * v for v in vec2.values()))
    if n1 == 0 or n2 == 0:
        return 0.0
    return dot / (n1 * n2)


def _similarity(a: str, b: str, idf: Dict[str, float] | None = None) -> float:
    ta = _tokenize(a)
    tb = _tokenize(b)
    if not idf:
        idf = _idf([ta, tb])
    v1 = {t: tf * idf.get(t, 1.0) for t, tf in _tf(ta).items()}
    v2 = {t: tf * idf.get(t, 1.0) for t, tf in _tf(tb).items()}
    return _cosine(v1, v2)


def _normalize_loc(s: str | None) -> str:
    return (s or "").strip().lower()


def _date_from_item(it: Item) -> date | None:
    return it.occurred_on or (it.reported_at.date() if it.reported_at else None)


def _date_from_str(s: str | None) -> date | None:
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            continue
    return None


def _score_pair(base_text: str, cand_text: str, base_loc: str | None, cand_loc: str | None, base_date: date | None, cand_date: date | None, shared_idf: Dict[str, float] | None) -> float:
    # Text similarity
    text_sim = _similarity(base_text, cand_text, idf=shared_idf)

    # Location bonus
    bl = _normalize_loc(base_loc)
    cl = _normalize_loc(cand_loc)
    loc_bonus = 0.0
    if bl and cl:
        if bl == cl:
            loc_bonus = 0.15
        elif bl in cl or cl in bl:
            loc_bonus = 0.10

    # Date proximity bonus
    date_bonus = 0.0
    if base_date and cand_date:
        diff = abs((base_date - cand_date).days)
        if diff <= 1:
            date_bonus = 0.15
        elif diff <= 3:
            date_bonus = 0.12
        elif diff <= 7:
            date_bonus = 0.10
        elif diff <= 14:
            date_bonus = 0.05

    # Weighted sum
    score = 0.7 * text_sim + loc_bonus + date_bonus
    if score > 1.0:
        score = 1.0
    return round(score, 4)


def _compose_text(it: Item) -> str:
    return f"{it.title or ''} {it.description or ''}".strip()


def _candidate_query(opposite_type: str, location: str | None = None, around: date | None = None) -> Iterable[Item]:
    q = Item.query.filter(Item.type == opposite_type)
    # Prefer open items
    q = q.filter(Item.status.in_(["open", "matched"]))
    if location:
        # Loose filter by location substring to reduce set
        q = q.filter(Item.location.ilike(f"%{location}%"))
    if around:
        start = around - timedelta(days=30)
        end = around + timedelta(days=30)
        q = q.filter(
            db.or_(
                db.and_(Item.occurred_on.isnot(None), Item.occurred_on.between(start, end)),
                db.and_(Item.occurred_on.is_(None), Item.reported_at.between(datetime.combine(start, datetime.min.time()), datetime.combine(end, datetime.max.time())))
            )
        )
    return q.order_by(Item.reported_at.desc()).limit(400)


@bp.get("/smart")
def smart_search():
    """Find potential matches between lost and found items.

    Query params:
      - itemId: if provided, base the search on this item and match to opposite type
      - q: free-text query (used when itemId not provided)
      - type: 'lost' or 'found' indicating the side of the query (opposite type are candidates)
      - location: optional location hint
      - date: optional date (YYYY-MM-DD) hint
      - limit: max results (default 10)
    """
    try:
        limit = int(request.args.get("limit", 10))
    except Exception:
        limit = 10

    item_id = request.args.get("itemId")
    results: List[Dict] = []

    if item_id:
        try:
            base_id = int(item_id)
        except Exception:
            return jsonify({"error": "Invalid itemId"}), 400
        base = Item.query.get(base_id)
        if not base:
            return jsonify({"error": "Item not found"}), 404
        opposite = "found" if base.type == "lost" else "lost"
        base_text = _compose_text(base)
        base_loc = base.location
        base_date = _date_from_item(base)

        candidates = list(_candidate_query(opposite_type=opposite, location=base_loc, around=base_date))
        # Prepare shared IDF across base + candidates for stable scoring
        docs = [_tokenize(base_text)] + [_tokenize(_compose_text(it)) for it in candidates]
        idf = _idf(docs)

        scored: List[Tuple[Item, float]] = []
        for it in candidates:
            cand_text = _compose_text(it)
            s = _score_pair(base_text, cand_text, base_loc, it.location, base_date, _date_from_item(it), idf)
            scored.append((it, s))

        scored.sort(key=lambda x: x[1], reverse=True)
        for it, score in scored[: limit if limit > 0 else 10]:
            rec = {
                "lostItem": base.id if base.type == "lost" else it.id,
                "foundItem": it.id if base.type == "lost" else base.id,
                "score": float(score),
                "candidate": {
                    "id": it.id,
                    "type": it.type,
                    "title": it.title,
                    "description": it.description,
                    "location": it.location,
                    "occurredOn": it.occurred_on.isoformat() if it.occurred_on else None,
                    "reportedAt": it.reported_at.isoformat() if it.reported_at else None,
                    "status": it.status,
                    "photoUrl": it.photo_url,
                },
            }
            results.append(rec)
        return jsonify({"matches": results})

    # Free-text mode
    q = (request.args.get("q") or "").strip()
    side = (request.args.get("type") or "").strip().lower()
    if not q or side not in ("lost", "found"):
        return jsonify({"error": "Provide either itemId or (q and type in ['lost','found'])"}), 400
    location = (request.args.get("location") or "").strip() or None
    date_hint = _date_from_str(request.args.get("date"))

    opposite = "found" if side == "lost" else "lost"
    candidates = list(_candidate_query(opposite_type=opposite, location=location, around=date_hint))

    # Shared IDF across query + candidates
    docs = [_tokenize(q)] + [_tokenize(_compose_text(it)) for it in candidates]
    idf = _idf(docs)

    scored: List[Tuple[Item, float]] = []
    for it in candidates:
        s = _score_pair(q, _compose_text(it), location, it.location, date_hint, _date_from_item(it), idf)
        scored.append((it, s))

    scored.sort(key=lambda x: x[1], reverse=True)
    out: List[Dict] = []
    for it, score in scored[: limit if limit > 0 else 10]:
        out.append(
            {
                "lostItem": None if side == "lost" else it.id,
                "foundItem": it.id if side == "lost" else None,
                "score": float(score),
                "candidate": {
                    "id": it.id,
                    "type": it.type,
                    "title": it.title,
                    "description": it.description,
                    "location": it.location,
                    "occurredOn": it.occurred_on.isoformat() if it.occurred_on else None,
                    "reportedAt": it.reported_at.isoformat() if it.reported_at else None,
                    "status": it.status,
                    "photoUrl": it.photo_url,
                },
            }
        )
    return jsonify({"matches": out})

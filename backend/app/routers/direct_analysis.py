"""Direct analysis module: n-grams, heatmap, A/B stats, search query analysis, local clustering."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.db.session import get_db
from app.models.direct import (
    Ad, AdGroup, AdStatus, Campaign,
    Keyword, NegativeKeyword,
)
from app.routers.direct import _ad_dict

router = APIRouter()


# ─── N-gram Analysis ──────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/direct/ngrams")
def get_ngrams(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    n: int = 2,
    min_count: int = 3,
):
    """Analyse n-grams across all project keywords."""
    import re
    from collections import defaultdict, Counter

    if n not in (2, 3):
        raise HTTPException(status_code=400, detail="n must be 2 or 3")

    campaigns = db.scalars(select(Campaign).where(Campaign.project_id == project_id)).all()
    campaign_ids = [c.id for c in campaigns]
    if not campaign_ids:
        return {"ngrams": [], "total_keywords": 0}

    group_ids = db.scalars(select(AdGroup.id).where(AdGroup.campaign_id.in_(campaign_ids))).all()
    if not group_ids:
        return {"ngrams": [], "total_keywords": 0}

    keywords = db.scalars(select(Keyword).where(Keyword.ad_group_id.in_(group_ids))).all()
    phrases = [kw.phrase for kw in keywords]

    def tokenize(phrase: str) -> list[str]:
        return re.sub(r"[^\w\s]", "", phrase.lower()).split()

    ngram_counts: Counter = Counter()
    ngram_keywords: dict[tuple, list[str]] = defaultdict(list)

    for phrase in phrases:
        words = tokenize(phrase)
        if len(words) < n:
            continue
        seen_ngrams = set()
        for i in range(len(words) - n + 1):
            gram = tuple(words[i : i + n])
            ngram_counts[gram] += 1
            if gram not in seen_ngrams:
                ngram_keywords[gram].append(phrase)
                seen_ngrams.add(gram)

    top = sorted(
        [(gram, cnt) for gram, cnt in ngram_counts.items() if cnt >= min_count],
        key=lambda x: x[1],
        reverse=True,
    )[:50]

    return {
        "ngrams": [
            {
                "ngram": " ".join(gram),
                "count": cnt,
                "keywords": ngram_keywords[gram][:10],
            }
            for gram, cnt in top
        ],
        "total_keywords": len(phrases),
        "n": n,
    }


# ─── Keyword Heatmap ──────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/direct/keywords/heatmap")
def keywords_heatmap(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Heatmap: temperature × frequency range."""
    campaigns = db.scalars(select(Campaign).where(Campaign.project_id == project_id)).all()
    campaign_ids = [c.id for c in campaigns]
    if not campaign_ids:
        return {"matrix": [], "totals": {}}

    group_ids = db.scalars(select(AdGroup.id).where(AdGroup.campaign_id.in_(campaign_ids))).all()
    if not group_ids:
        return {"matrix": [], "totals": {}}

    keywords = db.scalars(select(Keyword).where(Keyword.ad_group_id.in_(group_ids))).all()

    FREQ_RANGES = [
        ("0", 0, 0),
        ("1-100", 1, 100),
        ("101-1000", 101, 1000),
        ("1001-10000", 1001, 10000),
        ("10000+", 10001, None),
    ]
    TEMPS = ["hot", "warm", "cold", None]

    def freq_range(f) -> str:
        if f is None or f == 0:
            return "0"
        if f <= 100:
            return "1-100"
        if f <= 1000:
            return "101-1000"
        if f <= 10000:
            return "1001-10000"
        return "10000+"

    matrix = []
    for temp in TEMPS:
        for freq_label, _, _ in FREQ_RANGES:
            group_kws = [
                k for k in keywords
                if (k.temperature.value if k.temperature else None) == temp
                and freq_range(k.frequency) == freq_label
            ]
            if group_kws:
                matrix.append({
                    "temp": temp,
                    "freq_range": freq_label,
                    "count": len(group_kws),
                    "avg_freq": round(
                        sum(k.frequency or 0 for k in group_kws) / len(group_kws), 1
                    ),
                })

    totals = {}
    for temp in ["hot", "warm", "cold"]:
        totals[temp] = sum(1 for k in keywords if k.temperature and k.temperature.value == temp)
    totals["unknown"] = sum(1 for k in keywords if not k.temperature)

    return {"matrix": matrix, "totals": totals, "total_keywords": len(keywords)}


# ─── A/B Ad Stats ─────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/direct/ads/ab-stats")
def ab_ad_stats(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Show ads grouped by ad group for A/B comparison."""
    campaigns = db.scalars(select(Campaign).where(Campaign.project_id == project_id)).all()
    campaign_ids = [c.id for c in campaigns]
    if not campaign_ids:
        return []

    groups = db.scalars(select(AdGroup).where(AdGroup.campaign_id.in_(campaign_ids))).all()
    result = []
    for group in groups:
        ads = db.scalars(
            select(Ad).where(Ad.ad_group_id == group.id).order_by(Ad.variant)
        ).all()
        if len(ads) >= 2:
            result.append({
                "group_id": str(group.id),
                "group_name": group.name,
                "ads": [_ad_dict(a) for a in ads],
            })
    return result


@router.post("/direct/ads/{ad_id}/mark-winner")
def mark_ad_winner(
    ad_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Mark ad as winner (ready), set others in same group to paused."""
    ad = db.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")

    ad.status = AdStatus.READY

    other_ads = db.scalars(
        select(Ad).where(Ad.ad_group_id == ad.ad_group_id, Ad.id != ad_id)
    ).all()
    for other in other_ads:
        other.status = AdStatus.PAUSED

    db.commit()
    return {"ok": True, "winner_id": str(ad_id), "paused": len(other_ads)}


# ─── Analyze Search Queries (Negative KW suggestions) ────────────────────────

class AnalyzeQueriesRequest(BaseModel):
    queries: list[str]


@router.post("/projects/{project_id}/direct/analyze-search-queries")
async def analyze_search_queries(
    project_id: uuid.UUID,
    body: AnalyzeQueriesRequest,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Analyze search queries and suggest negative keywords via Claude."""
    import json
    import re

    if not body.queries:
        raise HTTPException(status_code=400, detail="queries list is required")

    campaigns = db.scalars(select(Campaign).where(Campaign.project_id == project_id)).all()
    campaign_ids = [c.id for c in campaigns]
    existing_phrases: list[str] = []
    if campaign_ids:
        group_ids = db.scalars(select(AdGroup.id).where(AdGroup.campaign_id.in_(campaign_ids))).all()
        if group_ids:
            kws = db.scalars(
                select(Keyword).where(Keyword.ad_group_id.in_(group_ids)).limit(50)
            ).all()
            existing_phrases = [k.phrase for k in kws]

    from app.services.claude import get_claude_client
    claude = get_claude_client(db)

    queries_text = "\n".join(f"- {q}" for q in body.queries[:200])
    keywords_text = "\n".join(f"- {k}" for k in existing_phrases)

    system_prompt = "Ты — специалист по Яндекс Директ. Анализируй поисковые запросы и предлагай минус-слова."
    user_msg = f"""Вот список поисковых запросов из статистики:
{queries_text}

Вот ключевые слова кампании:
{keywords_text}

Определи нерелевантные запросы и предложи минус-слова для исключения.
Верни ТОЛЬКО JSON (без markdown):
{{"negative_keywords": [{{"phrase": "строка", "reason": "объяснение", "block": "campaign"}}]}}
block может быть "campaign" или "group"."""

    response_text = await claude.generate(system_prompt, user_msg)
    json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
    if not json_match:
        raise HTTPException(status_code=502, detail="Failed to parse Claude response")

    data = json.loads(json_match.group())
    return {"suggestions": data.get("negative_keywords", []), "queries_analyzed": len(body.queries)}


# ─── Local Clustering (pymorphy2) ─────────────────────────────────────────────

try:
    import pymorphy2 as _pymorphy2
    HAS_MORPHY = True
except ImportError:
    HAS_MORPHY = False


class LocalClusterRequest(BaseModel):
    ad_group_id: uuid.UUID | None = None


@router.post("/projects/{project_id}/direct/keywords/cluster-local")
def cluster_keywords_local(
    project_id: uuid.UUID,
    body: LocalClusterRequest,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Cluster keywords locally using pymorphy2 lemmatization + Jaccard similarity."""
    import re

    STOP_WORDS = {
        "в", "на", "по", "для", "с", "и", "или", "не", "то", "к",
        "как", "что", "это", "так", "все", "уже", "там",
        "купить", "заказать", "цена", "цены", "онлайн", "недорого",
    }

    if body.ad_group_id:
        keywords = db.scalars(
            select(Keyword).where(Keyword.ad_group_id == body.ad_group_id)
        ).all()
    else:
        campaigns = db.scalars(select(Campaign).where(Campaign.project_id == project_id)).all()
        campaign_ids = [c.id for c in campaigns]
        if not campaign_ids:
            return {"clusters": [], "total": 0}
        group_ids = db.scalars(select(AdGroup.id).where(AdGroup.campaign_id.in_(campaign_ids))).all()
        if not group_ids:
            return {"clusters": [], "total": 0}
        keywords = db.scalars(select(Keyword).where(Keyword.ad_group_id.in_(group_ids))).all()

    if not keywords:
        return {"clusters": [], "total": 0}

    if HAS_MORPHY:
        morph = _pymorphy2.MorphAnalyzer()

        def normalize(phrase: str) -> frozenset:
            words = re.sub(r"[^\w\s]", "", phrase.lower()).split()
            lemmas = []
            for w in words:
                if w not in STOP_WORDS and len(w) >= 3:
                    parsed = morph.parse(w)
                    lemmas.append(parsed[0].normal_form if parsed else w)
            return frozenset(sorted(lemmas))
    else:
        def normalize(phrase: str) -> frozenset:
            words = re.sub(r"[^\w\s]", "", phrase.lower()).split()
            return frozenset(w for w in words if w not in STOP_WORDS and len(w) >= 3)

    def jaccard(a: frozenset, b: frozenset) -> float:
        if not a and not b:
            return 1.0
        inter = len(a & b)
        union = len(a | b)
        return inter / union if union else 0.0

    kw_list = list(keywords)
    norms = [normalize(k.phrase) for k in kw_list]

    parent = list(range(len(kw_list)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        parent[find(x)] = find(y)

    for i in range(len(kw_list)):
        for j in range(i + 1, len(kw_list)):
            if jaccard(norms[i], norms[j]) > 0.5:
                union(i, j)

    groups: dict[int, list[int]] = {}
    for i in range(len(kw_list)):
        root = find(i)
        groups.setdefault(root, []).append(i)

    clusters = []
    for root, indices in groups.items():
        members = [kw_list[i] for i in indices]
        name = sorted(members, key=lambda k: len(k.phrase))[0].phrase
        clusters.append({
            "name": name,
            "keywords": [{"id": str(m.id), "phrase": m.phrase} for m in members],
            "size": len(members),
        })

    clusters.sort(key=lambda c: c["size"], reverse=True)
    return {
        "clusters": clusters,
        "total": len(kw_list),
        "method": "pymorphy2" if HAS_MORPHY else "simple",
    }

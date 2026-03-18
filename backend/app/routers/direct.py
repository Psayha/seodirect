from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.db.session import get_db
from app.models.direct import (
    Ad, AdGroup, AdStatus, Campaign, CampaignStatus,
    Keyword, KeywordStatus, KeywordTemperature, NegativeKeyword,
)
from app.models.task import Task, TaskType, TaskStatus

router = APIRouter()


# ─── Strategy ─────────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/direct/strategy/generate")
def generate_strategy(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    task = Task(
        project_id=project_id,
        type=TaskType.GENERATE_STRATEGY,
        status=TaskStatus.PENDING,
        progress=0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    from app.tasks.direct import task_generate_strategy
    result = task_generate_strategy.delay(str(task.id), str(project_id))
    task.celery_task_id = result.id
    db.commit()

    return {"task_id": str(task.id)}


@router.get("/projects/{project_id}/direct/strategy")
def get_strategy(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    campaign = db.scalar(
        select(Campaign)
        .where(Campaign.project_id == project_id, Campaign.strategy_text.isnot(None))
        .order_by(Campaign.priority)
    )
    if not campaign:
        return {"strategy_text": None}
    return {"strategy_text": campaign.strategy_text, "campaign_id": str(campaign.id)}


@router.put("/projects/{project_id}/direct/strategy")
def update_strategy(
    project_id: uuid.UUID,
    body: dict,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    campaign = db.scalar(
        select(Campaign).where(Campaign.project_id == project_id).order_by(Campaign.priority)
    )
    if not campaign:
        campaign = Campaign(project_id=project_id, name="Стратегия")
        db.add(campaign)
    campaign.strategy_text = body.get("strategy_text", "")
    db.commit()
    return {"ok": True}


# ─── Campaigns ────────────────────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    name: str
    type: str | None = None
    priority: int = 0
    geo: dict | None = None
    budget_monthly: float | None = None


class CampaignUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    priority: int | None = None
    status: str | None = None
    geo: dict | None = None
    budget_monthly: float | None = None
    sitelinks: list | None = None


@router.get("/projects/{project_id}/direct/campaigns")
def list_campaigns(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    campaigns = db.scalars(
        select(Campaign).where(Campaign.project_id == project_id).order_by(Campaign.priority)
    ).all()
    return [_campaign_dict(c) for c in campaigns]


@router.post("/projects/{project_id}/direct/campaigns", status_code=status.HTTP_201_CREATED)
def create_campaign(
    project_id: uuid.UUID,
    body: CampaignCreate,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    c = Campaign(project_id=project_id, **body.model_dump(exclude_none=True))
    db.add(c)
    db.commit()
    db.refresh(c)
    return _campaign_dict(c)


@router.patch("/direct/campaigns/{campaign_id}")
def update_campaign(
    campaign_id: uuid.UUID,
    body: CampaignUpdate,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    c = db.get(Campaign, campaign_id)
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(c, k, v)
    db.commit()
    return _campaign_dict(c)


@router.delete("/direct/campaigns/{campaign_id}", status_code=204)
def delete_campaign(
    campaign_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    c = db.get(Campaign, campaign_id)
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    db.delete(c)
    db.commit()


# ─── Ad Groups ────────────────────────────────────────────────────────────────

@router.get("/direct/campaigns/{campaign_id}/groups")
def list_groups(
    campaign_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    groups = db.scalars(select(AdGroup).where(AdGroup.campaign_id == campaign_id)).all()
    return [{"id": str(g.id), "campaign_id": str(g.campaign_id), "name": g.name, "status": g.status} for g in groups]


@router.post("/direct/campaigns/{campaign_id}/groups", status_code=201)
def create_group(
    campaign_id: uuid.UUID,
    body: dict,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    g = AdGroup(campaign_id=campaign_id, name=body.get("name", "Новая группа"))
    db.add(g)
    db.commit()
    db.refresh(g)
    return {"id": str(g.id), "name": g.name, "campaign_id": str(g.campaign_id)}


# ─── Keywords ─────────────────────────────────────────────────────────────────

@router.get("/direct/groups/{group_id}/keywords")
def list_keywords(
    group_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    temperature: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
):
    q = select(Keyword).where(Keyword.ad_group_id == group_id)
    if temperature:
        q = q.where(Keyword.temperature == KeywordTemperature(temperature))
    if status_filter:
        q = q.where(Keyword.status == KeywordStatus(status_filter))
    kws = db.scalars(q.order_by(Keyword.frequency.desc().nullslast())).all()
    return [_kw_dict(k) for k in kws]


@router.post("/direct/groups/{group_id}/keywords/generate")
def generate_keywords(
    group_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    group = db.get(AdGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    campaign = db.get(Campaign, group.campaign_id)
    task = Task(
        project_id=campaign.project_id,
        type=TaskType.GENERATE_KEYWORDS,
        status=TaskStatus.PENDING,
        progress=0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(task)
    db.commit()
    # Run synchronously for now (small operation)
    kws = asyncio.run(
        __import__("app.direct.service", fromlist=["generate_keywords_for_group"])
        .generate_keywords_for_group(group_id, db)
    )
    task.status = TaskStatus.SUCCESS
    task.progress = 100
    task.result = {"keywords_created": len(kws)}
    task.finished_at = datetime.now(timezone.utc)
    db.commit()
    return {"keywords_created": len(kws), "task_id": str(task.id)}


@router.post("/direct/groups/{group_id}/keywords/check-frequency")
def check_keyword_frequency(
    group_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    keywords = db.scalars(select(Keyword).where(Keyword.ad_group_id == group_id)).all()
    if not keywords:
        raise HTTPException(status_code=400, detail="No keywords in group")
    campaign = db.get(Campaign, db.get(AdGroup, group_id).campaign_id)
    task = Task(
        project_id=campaign.project_id,
        type=TaskType.CHECK_FREQUENCIES,
        status=TaskStatus.PENDING,
        progress=0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    from app.tasks.direct import task_check_frequencies
    result = task_check_frequencies.delay(str(task.id), [str(k.id) for k in keywords])
    task.celery_task_id = result.id
    db.commit()
    return {"task_id": str(task.id)}


@router.get("/direct/keywords/dynamics")
async def keyword_dynamics(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    phrase: str = "",
):
    """Return monthly frequency dynamics for a phrase from Wordstat."""
    if not phrase:
        raise HTTPException(status_code=400, detail="phrase required")
    from app.services.wordstat import WordstatClient
    from app.services.settings_service import get_setting
    token = get_setting("wordstat_oauth_token", db)
    if not token:
        raise HTTPException(status_code=400, detail="Wordstat OAuth token not configured")
    client = WordstatClient(token)
    data = await client.get_dynamics(phrase)
    return {"phrase": phrase, "dynamics": data}


@router.post("/direct/keywords", status_code=201)
def add_keyword(current_user: CurrentUser, _: Annotated[object, NonViewerRequired], body: dict, db: Annotated[Session, Depends(get_db)]):
    kw = Keyword(
        ad_group_id=uuid.UUID(body["ad_group_id"]),
        phrase=body["phrase"],
        temperature=KeywordTemperature(body.get("temperature", "warm")),
    )
    db.add(kw)
    db.commit()
    db.refresh(kw)
    return _kw_dict(kw)


@router.delete("/direct/keywords/{keyword_id}", status_code=204)
def delete_keyword(keyword_id: uuid.UUID, current_user: CurrentUser, _: Annotated[object, NonViewerRequired], db: Annotated[Session, Depends(get_db)]):
    kw = db.get(Keyword, keyword_id)
    if kw:
        db.delete(kw)
        db.commit()


# ─── Ads ──────────────────────────────────────────────────────────────────────

@router.get("/direct/groups/{group_id}/ads")
def list_ads(group_id: uuid.UUID, current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]):
    ads = db.scalars(select(Ad).where(Ad.ad_group_id == group_id).order_by(Ad.variant)).all()
    return [_ad_dict(a) for a in ads]


@router.post("/direct/groups/{group_id}/ads/generate")
def generate_ads(
    group_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
    variants: int = 2,
):
    from app.direct.service import generate_ads_for_group
    ads = asyncio.run(generate_ads_for_group(group_id, variants, db))
    return {"ads_created": len(ads), "ads": [_ad_dict(a) for a in ads]}


@router.patch("/direct/ads/{ad_id}")
def update_ad(ad_id: uuid.UUID, body: dict, current_user: CurrentUser, _: Annotated[object, NonViewerRequired], db: Annotated[Session, Depends(get_db)]):
    ad = db.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    for field in ("headline1", "headline2", "headline3", "text", "display_url", "utm", "status"):
        if field in body:
            val = body[field]
            if field == "status":
                val = AdStatus(val)
            setattr(ad, field, val)
    db.commit()
    return _ad_dict(ad)


# ─── Negative Keywords ────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/direct/negative-keywords")
def list_negative_keywords(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    nkws = db.scalars(select(NegativeKeyword).where(NegativeKeyword.project_id == project_id)).all()
    return [{"id": str(n.id), "phrase": n.phrase, "block": n.block, "campaign_id": str(n.campaign_id) if n.campaign_id else None} for n in nkws]


@router.post("/projects/{project_id}/direct/negative-keywords/generate")
def generate_negative_keywords_endpoint(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    from app.direct.service import generate_negative_keywords
    nkws = asyncio.run(generate_negative_keywords(project_id, db))
    return {"created": len(nkws)}


@router.post("/projects/{project_id}/direct/negative-keywords", status_code=201)
def add_negative_keyword(
    project_id: uuid.UUID,
    body: dict,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    nk = NegativeKeyword(project_id=project_id, phrase=body["phrase"], block=body.get("block", "general"))
    db.add(nk)
    db.commit()
    db.refresh(nk)
    return {"id": str(nk.id), "phrase": nk.phrase, "block": nk.block}


@router.delete("/direct/negative-keywords/{nk_id}", status_code=204)
def delete_negative_keyword(nk_id: uuid.UUID, current_user: CurrentUser, _: Annotated[object, NonViewerRequired], db: Annotated[Session, Depends(get_db)]):
    nk = db.get(NegativeKeyword, nk_id)
    if nk:
        db.delete(nk)
        db.commit()


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

    # Collect all keywords
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

    # Count n-grams
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

    # Filter and format top 50
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
                "keywords": ngram_keywords[gram][:10],  # sample
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

    # Set winner to ready
    ad.status = AdStatus.READY

    # Set all other ads in this group to paused
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

    # Get existing keywords for context (first 50)
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

    # Get keywords
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

    # Union-Find grouping
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
        # Name = most frequent phrase (by length as proxy)
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


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _campaign_dict(c: Campaign) -> dict:
    return {
        "id": str(c.id),
        "project_id": str(c.project_id),
        "name": c.name,
        "type": c.type,
        "priority": c.priority,
        "status": c.status.value,
        "geo": c.geo,
        "budget_monthly": c.budget_monthly,
        "sitelinks": c.sitelinks or [],
        "strategy_text": c.strategy_text,
        "created_at": c.created_at.isoformat(),
    }


def _kw_dict(k: Keyword) -> dict:
    return {
        "id": str(k.id),
        "ad_group_id": str(k.ad_group_id),
        "phrase": k.phrase,
        "frequency": k.frequency,
        "frequency_updated_at": k.frequency_updated_at,
        "temperature": k.temperature.value if k.temperature else None,
        "status": k.status.value,
        "match_type": k.match_type,
    }


def _ad_dict(a: Ad) -> dict:
    h1 = a.headline1 or ""
    h2 = a.headline2 or ""
    h3 = a.headline3 or ""
    txt = a.text or ""
    return {
        "id": str(a.id),
        "ad_group_id": str(a.ad_group_id),
        "headline1": h1, "headline1_len": len(h1),
        "headline2": h2, "headline2_len": len(h2),
        "headline3": h3, "headline3_len": len(h3),
        "text": txt, "text_len": len(txt),
        "display_url": a.display_url,
        "utm": a.utm,
        "status": a.status.value,
        "variant": a.variant,
        "valid": len(h1) <= 56 and len(h2) <= 30 and len(h3) <= 30 and len(txt) <= 81,
    }

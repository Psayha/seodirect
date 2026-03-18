from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.brief import Brief
from app.models.crawl import CrawlSession, CrawlStatus, Page
from app.models.direct import (
    Ad,
    AdGroup,
    AdStatus,
    Campaign,
    Keyword,
    KeywordStatus,
    KeywordTemperature,
    NegativeKeyword,
)


def _brief_to_text(brief: Brief) -> str:
    parts = []
    if brief.niche:
        parts.append(f"Ниша: {brief.niche}")
    if brief.products:
        parts.append(f"Продукты/услуги: {brief.products}")
    if brief.price_segment:
        parts.append(f"Ценовой сегмент: {brief.price_segment}")
    if brief.geo:
        parts.append(f"Гео бизнеса: {brief.geo}")
    if brief.target_audience:
        parts.append(f"Целевая аудитория: {brief.target_audience}")
    if brief.pains:
        parts.append(f"Боли клиентов: {brief.pains}")
    if brief.usp:
        parts.append(f"УТП и преимущества: {brief.usp}")
    if brief.campaign_goal:
        parts.append(f"Цель кампании: {brief.campaign_goal}")
    if brief.ad_geo:
        parts.append(f"Гео таргетинг: {', '.join(brief.ad_geo)}")
    if brief.monthly_budget:
        parts.append(f"Месячный бюджет: {brief.monthly_budget} ₽")
    if brief.restrictions:
        parts.append(f"Ограничения: {brief.restrictions}")
    return "\n".join(parts) if parts else "Бриф не заполнен"


def _crawl_summary(project_id: uuid.UUID, db: Session) -> str:
    session = db.scalar(
        select(CrawlSession)
        .where(CrawlSession.project_id == project_id, CrawlSession.status == CrawlStatus.DONE)
        .order_by(CrawlSession.finished_at.desc())
    )
    if not session:
        return "Сайт не проанализирован"
    pages = db.scalars(
        select(Page).where(Page.crawl_session_id == session.id).limit(20)
    ).all()
    summary = f"Просканировано страниц: {session.pages_total}\n"
    summary += "Примеры страниц:\n"
    for p in pages[:10]:
        summary += f"  - {p.url}: {p.title or 'без title'}\n"
    return summary


async def generate_strategy(project_id: uuid.UUID, db: Session) -> str:
    from app.services.settings_service import get_prompt

    brief = db.scalar(select(Brief).where(Brief.project_id == project_id))
    brief_text = _brief_to_text(brief) if brief else "Бриф не заполнен"
    crawl_text = _crawl_summary(project_id, db)

    system_prompt = get_prompt("direct_strategy", db) or "Ты эксперт по Яндекс Директ."
    user_msg = f"ДАННЫЕ БРИФА:\n{brief_text}\n\nДАННЫЕ САЙТА:\n{crawl_text}"

    from app.services.claude import get_claude_client
    client = get_claude_client(db)
    result = await client.generate(system_prompt, user_msg)
    return result


async def generate_keywords_for_group(
    group_id: uuid.UUID, db: Session
) -> list[Keyword]:
    from app.services.settings_service import get_prompt

    group = db.get(AdGroup, group_id)
    if not group:
        raise ValueError("Group not found")
    campaign = db.get(Campaign, group.campaign_id)
    brief = db.scalar(select(Brief).where(Brief.project_id == campaign.project_id))
    brief_summary = _brief_to_text(brief) if brief else ""

    system_prompt = get_prompt("direct_keywords", db) or "Ты эксперт по семантическому ядру."
    user_msg = (
        system_prompt
        .replace("{campaign_name}", campaign.name)
        .replace("{group_name}", group.name)
        .replace("{brief_summary}", brief_summary)
    )

    from app.services.claude import get_claude_client
    client = get_claude_client(db)
    raw = await client.generate(
        "Возврати ТОЛЬКО валидный JSON массив, без пояснений.",
        user_msg,
    )

    # Parse JSON
    try:
        # Extract JSON from possible markdown code block
        text = raw.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        items = json.loads(text.strip())
    except Exception:
        return []

    keywords = []
    for item in items:
        if not isinstance(item, dict) or "phrase" not in item:
            continue
        temp_str = item.get("temperature", "warm")
        try:
            temp = KeywordTemperature(temp_str)
        except ValueError:
            temp = KeywordTemperature.WARM
        kw = Keyword(
            ad_group_id=group_id,
            phrase=item["phrase"],
            temperature=temp,
        )
        db.add(kw)
        keywords.append(kw)
    db.commit()
    return keywords


async def generate_ads_for_group(
    group_id: uuid.UUID, variants: int = 2, db: Session = None
) -> list[Ad]:
    from app.services.settings_service import get_prompt

    group = db.get(AdGroup, group_id)
    if not group:
        raise ValueError("Group not found")
    campaign = db.get(Campaign, group.campaign_id)
    brief = db.scalar(select(Brief).where(Brief.project_id == campaign.project_id))

    keywords = db.scalars(
        select(Keyword).where(Keyword.ad_group_id == group_id).limit(10)
    ).all()
    keywords_text = ", ".join(kw.phrase for kw in keywords)

    system_prompt = get_prompt("direct_ads", db) or "Ты копирайтер для контекстной рекламы."
    user_msg = (
        system_prompt
        .replace("{group_name}", group.name)
        .replace("{keywords}", keywords_text)
        .replace("{brief_usp}", brief.usp or "" if brief else "")
        .replace("{variants_count}", str(variants))
    )

    from app.services.claude import get_claude_client
    client = get_claude_client(db)
    raw = await client.generate(
        "Возврати ТОЛЬКО валидный JSON массив, без пояснений.",
        user_msg,
    )

    try:
        text = raw.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        items = json.loads(text.strip())
    except Exception:
        return []

    ads = []
    for i, item in enumerate(items[:variants], 1):
        if not isinstance(item, dict):
            continue
        ad = Ad(
            ad_group_id=group_id,
            headline1=(item.get("headline1") or "")[:56],
            headline2=(item.get("headline2") or "")[:30],
            headline3=(item.get("headline3") or "")[:30],
            text=(item.get("text") or "")[:81],
            variant=i,
        )
        db.add(ad)
        ads.append(ad)
    db.commit()
    return ads


async def generate_negative_keywords(project_id: uuid.UUID, db: Session) -> list[NegativeKeyword]:
    from app.services.settings_service import get_prompt

    brief = db.scalar(select(Brief).where(Brief.project_id == project_id))
    keywords = db.scalars(
        select(Keyword)
        .join(AdGroup)
        .join(Campaign)
        .where(Campaign.project_id == project_id)
        .limit(30)
    ).all()
    keywords_sample = ", ".join(kw.phrase for kw in keywords)

    system_prompt = get_prompt("direct_negative_keywords", db) or "Ты эксперт по минус-словам."
    user_msg = (
        system_prompt
        .replace("{niche}", brief.niche or "" if brief else "")
        .replace("{keywords_sample}", keywords_sample)
    )

    from app.services.claude import get_claude_client
    client = get_claude_client(db)
    raw = await client.generate(
        "Возврати ТОЛЬКО валидный JSON объект, без пояснений.",
        user_msg,
    )

    try:
        text = raw.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text.strip())
    except Exception:
        return []

    neg_kws = []
    for block, phrases in data.items():
        if not isinstance(phrases, list):
            continue
        for phrase in phrases:
            if not isinstance(phrase, str) or not phrase.strip():
                continue
            nk = NegativeKeyword(
                project_id=project_id,
                phrase=phrase.strip(),
                block=block,
            )
            db.add(nk)
            neg_kws.append(nk)
    db.commit()
    return neg_kws

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from app.celery_app import celery_app


@celery_app.task(bind=True, name="tasks.direct.generate_strategy")
def task_generate_strategy(self, task_id: str, project_id: str):
    from app.db.session import SessionLocal
    from app.models.task import Task, TaskStatus
    from app.models.project import Project
    from app.models.direct import Campaign
    from app.direct.service import generate_strategy

    db = SessionLocal()
    try:
        task = db.get(Task, uuid.UUID(task_id))
        if task:
            task.status = TaskStatus.RUNNING
            db.commit()

        strategy_text = asyncio.run(generate_strategy(uuid.UUID(project_id), db))

        # Save strategy to first campaign or create one
        campaign = db.scalar(
            __import__("sqlalchemy", fromlist=["select"]).select(Campaign)
            .where(Campaign.project_id == uuid.UUID(project_id))
            .order_by(Campaign.priority)
        )
        if not campaign:
            campaign = Campaign(
                project_id=uuid.UUID(project_id),
                name="Стратегия",
                strategy_text=strategy_text,
            )
            db.add(campaign)
        else:
            campaign.strategy_text = strategy_text
        db.commit()

        if task:
            task.status = TaskStatus.SUCCESS
            task.progress = 100
            task.result = {"strategy_length": len(strategy_text)}
            task.finished_at = datetime.now(timezone.utc)
            db.commit()

        return {"status": "success"}
    except Exception as e:
        if task:
            task.status = TaskStatus.FAILED
            task.error = str(e)[:500]
            task.finished_at = datetime.now(timezone.utc)
            db.commit()
        raise
    finally:
        db.close()


@celery_app.task(bind=True, name="tasks.direct.check_frequencies")
def task_check_frequencies(self, task_id: str, keyword_ids: list[str]):
    from app.db.session import SessionLocal
    from app.models.task import Task, TaskStatus
    from app.models.direct import Keyword, KeywordStatus
    from app.services.wordstat import get_wordstat_client
    from sqlalchemy import select

    db = SessionLocal()
    try:
        task = db.get(Task, uuid.UUID(task_id))
        if task:
            task.status = TaskStatus.RUNNING
            db.commit()

        client = get_wordstat_client(db)
        if not client:
            raise RuntimeError("Wordstat API key not configured")

        ids = [uuid.UUID(k) for k in keyword_ids]
        keywords = db.scalars(select(Keyword).where(Keyword.id.in_(ids))).all()
        phrases = [kw.phrase for kw in keywords]

        frequencies = asyncio.run(client.get_frequencies(phrases))

        updated = 0
        for kw in keywords:
            freq = frequencies.get(kw.phrase)
            if freq is not None:
                kw.frequency = freq
                kw.frequency_updated_at = datetime.now(timezone.utc).isoformat()
                if freq < 50:
                    kw.status = KeywordStatus.LOW_FREQUENCY
                updated += 1

        db.commit()

        if task:
            task.status = TaskStatus.SUCCESS
            task.progress = 100
            task.result = {"keywords_updated": updated}
            task.finished_at = datetime.now(timezone.utc)
            db.commit()

        return {"updated": updated}
    except Exception as e:
        if task:
            task.status = TaskStatus.FAILED
            task.error = str(e)[:500]
            task.finished_at = datetime.now(timezone.utc)
            db.commit()
        raise
    finally:
        db.close()

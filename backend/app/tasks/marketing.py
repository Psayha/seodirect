"""Celery tasks for Marketing / Semantic Core module."""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone

from app.celery_app import celery_app


def _run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, coro)
                return future.result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


# ─── Expand ───────────────────────────────────────────────────────────────────

_EXPAND_SYSTEM = """Ты — специалист по сбору семантического ядра для Яндекс и Google.
Твоя задача — расширить маску (базовый поисковый запрос) в список целевых запросов.
Отвечай строго JSON-массивом строк на русском языке. Никакого другого текста."""


def _build_expand_prompt(
    mask: str,
    mode: str,
    region: str | None,
    brief_context: str | None,
    modifiers: list[str] | None,
    site_context: str | None = None,
) -> str:
    mode_hint = "SEO-продвижения (включай информационные и коммерческие запросы)" if mode == "seo" else "Яндекс Директ (только коммерческие, транзакционные запросы)"
    region_hint = f" в регионе {region}" if region else ""
    lines = [f'Расширь маску «{mask}» для {mode_hint}{region_hint}.']
    if brief_context:
        lines.append(f"\nКонтекст бизнеса:\n{brief_context}")
    if site_context:
        lines.append(f"\nДанные анализа сайта (структура, УТП, ключевые темы):\n{site_context}")
    if modifiers:
        lines.append(f"\nОбязательно используй модификаторы: {', '.join(modifiers)}")
    lines.append("\nСгенерируй 60–100 поисковых запросов. Включи:")
    lines.append("- Коммерческие (купить, заказать, цена, стоимость, недорого)")
    lines.append("- Характеристики и типы (виды, размеры, материалы)")
    lines.append("- Целевые (для [аудитория], в [город/место])")
    if mode == "seo":
        lines.append("- Информационные (как выбрать, обзор, отзывы)")
    lines.append("\nУчитывай реальные услуги/товары и УТП с сайта клиента при генерации.")
    lines.append("\nВерни ТОЛЬКО JSON-массив. Пример: [\"купить диван\", \"диван в гостиную\"]")
    return "\n".join(lines)


def _parse_json_array(text: str) -> list[str]:
    """Extract JSON array from Claude response, tolerating markdown fences and truncation."""
    import logging as _log
    logger = _log.getLogger(__name__)

    text = text.strip()
    # Strip ```json ... ``` or ``` ... ```
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    start = text.find("[")
    if start == -1:
        logger.warning("_parse_json_array: no '[' found in response (%d chars)", len(text))
        return []

    fragment = text[start:]
    end = fragment.rfind("]")

    # ── Happy path: complete JSON array ────────────────────────────────────
    if end != -1:
        try:
            data = json.loads(fragment[: end + 1])
            result = [s.strip().lower() for s in data if isinstance(s, str) and s.strip()]
            logger.info("_parse_json_array: parsed %d items (complete JSON)", len(result))
            return result
        except json.JSONDecodeError:
            pass  # fall through to truncation recovery

    # ── Truncation recovery: response was cut off by max_tokens ────────────
    # Find the last complete quoted string entry: ..."some phrase",  or  ..."some phrase"
    logger.warning("_parse_json_array: incomplete JSON, attempting truncation recovery")
    # Trim to last complete quoted string
    last_quote = fragment.rfind('"')
    if last_quote <= 0:
        return []
    # Walk back to find the opening quote of this last entry
    candidate = fragment[: last_quote + 1]
    # Try progressively shorter slices until we get valid JSON
    for trim in (candidate + "]", candidate.rsplit(",", 1)[0] + "]"):
        try:
            data = json.loads(trim)
            result = [s.strip().lower() for s in data if isinstance(s, str) and s.strip()]
            logger.info("_parse_json_array: recovered %d items from truncated JSON", len(result))
            return result
        except json.JSONDecodeError:
            continue

    logger.warning("_parse_json_array: truncation recovery failed, response: %.500s", text)
    return []


@celery_app.task(
    bind=True,
    name="tasks.marketing.semantic_expand",
    max_retries=2,
    default_retry_delay=10,
)
def task_semantic_expand(
    self,
    task_id: str,
    sem_project_id: str,
    project_id: str,
    min_freq_exact: int = 0,
    use_brief: bool = True,
):
    from sqlalchemy import select

    from app.db.session import SessionLocal
    from app.models.brief import Brief
    from app.models.marketing import KeywordCache, SemanticKeyword, SemanticProject
    from app.models.task import Task, TaskStatus
    from app.services.claude import get_claude_client
    from app.services.wordstat import get_wordstat_client

    db = SessionLocal()
    task = None
    try:
        task = db.get(Task, uuid.UUID(task_id))
        if task:
            task.status = TaskStatus.RUNNING
            task.progress = 0
            db.commit()

        sem_id = uuid.UUID(sem_project_id)
        sp = db.get(SemanticProject, sem_id)
        if not sp:
            raise RuntimeError(f"SemanticProject {sem_project_id} not found")

        # ── Load selected masks ───────────────────────────────────────────────
        masks = db.scalars(
            select(SemanticKeyword).where(
                SemanticKeyword.semantic_project_id == sem_id,
                SemanticKeyword.is_mask.is_(True),
                SemanticKeyword.mask_selected.is_(True),
            )
        ).all()
        if not masks:
            raise RuntimeError("Нет выбранных масок. Вернитесь на шаг 2 и выберите маски.")

        mask_phrases = [m.phrase for m in masks]

        # ── Build brief context ───────────────────────────────────────────────
        brief_context: str | None = None
        if use_brief:
            brief = db.scalar(select(Brief).where(Brief.project_id == uuid.UUID(project_id)))
            if brief:
                parts = []
                if brief.niche:
                    parts.append(f"Ниша: {brief.niche}")
                if brief.products:
                    parts.append(f"Продукты: {brief.products}")
                if brief.target_audience:
                    parts.append(f"Аудитория: {brief.target_audience}")
                if brief.pains:
                    parts.append(f"Боли: {brief.pains}")
                if brief.usp:
                    parts.append(f"УТП: {brief.usp}")
                brief_context = "\n".join(parts) or None

        modifiers: list[str] | None = None
        if use_brief:
            brief_check = db.scalar(select(Brief).where(Brief.project_id == uuid.UUID(project_id)))
            if brief_check and brief_check.keyword_modifiers:
                modifiers = brief_check.keyword_modifiers

        # ── Build site context from crawl data ───────────────────────────────
        site_context: str | None = None
        try:
            from app.models.crawl import CrawlSession, CrawlStatus, Page

            crawl = db.scalar(
                select(CrawlSession).where(
                    CrawlSession.project_id == uuid.UUID(project_id),
                    CrawlSession.status == CrawlStatus.DONE,
                ).order_by(CrawlSession.finished_at.desc())
            )
            if crawl:
                top_pages = db.scalars(
                    select(Page).where(
                        Page.crawl_session_id == crawl.id,
                        Page.status_code == 200,
                    ).order_by(Page.word_count.desc()).limit(10)
                ).all()
                if top_pages:
                    parts = []
                    for p in top_pages:
                        page_info = f"— {p.url}: {p.title or 'без title'}"
                        if p.h1:
                            page_info += f" | H1: {p.h1}"
                        if p.h2_list:
                            page_info += f" | H2: {', '.join(p.h2_list[:5])}"
                        if p.content_text:
                            # First 500 chars of content for UVP/product analysis
                            page_info += f"\n  Контент: {p.content_text[:500]}"
                        parts.append(page_info)
                    site_context = "\n".join(parts)
        except Exception:
            import logging
            logging.getLogger(__name__).warning("Failed to load crawl data for semantic expand", exc_info=True)

        # ── Claude: generate keywords per mask ───────────────────────────────
        import logging
        logger = logging.getLogger(__name__)

        claude = get_claude_client(db, task_type="semantic_expand")
        from app.services.settings_service import get_prompt
        expand_system = get_prompt("semantic_expand", db) or _EXPAND_SYSTEM
        all_phrases: list[str] = []
        total_masks = len(mask_phrases)
        mask_errors: list[str] = []
        masks_ok = 0

        logger.info("Expanding %d masks (model=%s, max_tokens=%s)", total_masks, claude.model, claude.max_tokens)

        for idx, mask in enumerate(mask_phrases):
            prompt = _build_expand_prompt(
                mask=mask,
                mode=sp.mode.value,
                region=sp.region,
                brief_context=brief_context,
                modifiers=modifiers,
                site_context=site_context,
            )
            try:
                raw = _run_async(claude.generate(expand_system, prompt))
                logger.info(
                    "Mask '%s': Claude returned %d chars", mask, len(raw) if raw else 0
                )
                if raw:
                    logger.debug("Mask '%s' raw response: %.1000s", mask, raw)
                phrases = _parse_json_array(raw)
                logger.info("Mask '%s': parsed %d keywords", mask, len(phrases))
                if phrases:
                    masks_ok += 1
                    all_phrases.extend(phrases)
                else:
                    mask_errors.append(f"'{mask}': пустой результат парсинга (ответ {len(raw or '')} символов)")
            except Exception as exc:
                from app.services.claude import LLMBillingError
                logger.warning("Claude error for mask '%s': %s", mask, exc)
                mask_errors.append(f"'{mask}': {exc}")
                # Billing/auth errors won't resolve — stop immediately
                if isinstance(exc, LLMBillingError):
                    raise

            if task:
                task.progress = int(10 + (idx + 1) / total_masks * 40)  # 10→50
                db.commit()

        # Deduplicate and filter out masks themselves
        seen: set[str] = set(mask_phrases)
        unique_phrases: list[str] = []
        for p in all_phrases:
            if p not in seen:
                seen.add(p)
                unique_phrases.append(p)

        logger.info(
            "Claude total: %d phrases generated, %d unique after dedup",
            len(all_phrases), len(unique_phrases),
        )

        if task:
            task.progress = 50
            db.commit()

        # ── Fetch frequencies from Wordstat (with cache) ──────────────────────
        wordstat = get_wordstat_client(db)
        freq_map: dict[str, dict] = {}

        if not wordstat:
            logger.warning("Wordstat client not configured — frequencies will be 0")

        if wordstat and unique_phrases:
            from datetime import timedelta  # noqa: PLC0415

            from app.routers.marketing import CACHE_TTL_DAYS  # noqa: PLC0415

            cutoff = datetime.now(tz=timezone.utc) - timedelta(days=CACHE_TTL_DAYS)
            cached_rows = db.scalars(
                select(KeywordCache).where(
                    KeywordCache.phrase.in_(unique_phrases),
                    KeywordCache.region_id == sp.region_id,
                    KeywordCache.cached_at > cutoff,
                )
            ).all()
            cached_map = {row.phrase: row for row in cached_rows}
            uncached = [p for p in unique_phrases if p not in cached_map]

            if uncached:
                regions = [sp.region_id] if sp.region_id else None
                # Process in sub-batches to update progress (128 phrases * 4 = 512 variants per API call)
                sub_batch = 250  # ~1000 variants, ~8 API calls each
                for i in range(0, len(uncached), sub_batch):
                    batch = uncached[i : i + sub_batch]
                    try:
                        fresh = _run_async(wordstat.get_all_frequencies(batch, regions=regions))
                        now = datetime.now(tz=timezone.utc)
                        for phrase, freqs in fresh.items():
                            freq_map[phrase] = freqs
                            existing = db.scalar(
                                select(KeywordCache).where(
                                    KeywordCache.phrase == phrase,
                                    KeywordCache.region_id == sp.region_id,
                                )
                            )
                            if existing:
                                existing.frequency_base = freqs["base"]
                                existing.frequency_phrase = freqs["phrase_freq"]
                                existing.frequency_exact = freqs["exact"]
                                existing.frequency_order = freqs["order"]
                                existing.cached_at = now
                            else:
                                db.add(KeywordCache(
                                    phrase=phrase,
                                    region_id=sp.region_id,
                                    frequency_base=freqs["base"],
                                    frequency_phrase=freqs["phrase_freq"],
                                    frequency_exact=freqs["exact"],
                                    frequency_order=freqs["order"],
                                    cached_at=now,
                                ))
                    except Exception as exc:
                        import logging
                        logging.getLogger(__name__).warning("Wordstat batch error: %s", exc)

                    if task:
                        task.progress = int(50 + (i + sub_batch) / len(uncached) * 35)
                        db.commit()

            # Fill freq_map from cache for cached phrases
            for phrase in unique_phrases:
                if phrase not in freq_map and phrase in cached_map:
                    c = cached_map[phrase]
                    freq_map[phrase] = {
                        "base": c.frequency_base or 0,
                        "phrase_freq": c.frequency_phrase or 0,
                        "exact": c.frequency_exact or 0,
                        "order": c.frequency_order or 0,
                    }

        if task:
            task.progress = 85
            db.commit()

        # ── Save keywords to DB ───────────────────────────────────────────────
        if not unique_phrases:
            error_details = (
                f"Обработано масок: {total_masks}, успешных: {masks_ok}. "
            )
            if mask_errors:
                error_details += "Ошибки: " + "; ".join(mask_errors[:3])
            else:
                error_details += "Claude вернул ответы, но ни один не распарсился как JSON."
            raise RuntimeError(
                f"Claude не сгенерировал ни одного ключа. {error_details}"
            )

        def _kw_type(exact: int) -> str | None:
            if exact >= 1000:
                return "ВЧ"
            if exact >= 100:
                return "СЧ"
            if exact >= 1:
                return "НЧ"
            return None

        # Delete existing non-mask keywords for this semantic project
        # (safe: we verified unique_phrases is non-empty above)
        old_kws = db.scalars(
            select(SemanticKeyword).where(
                SemanticKeyword.semantic_project_id == sem_id,
                SemanticKeyword.is_mask.is_(False),
            )
        ).all()
        for kw in old_kws:
            db.delete(kw)
        db.flush()

        saved = 0
        for phrase in unique_phrases:
            f = freq_map.get(phrase, {"base": 0, "phrase_freq": 0, "exact": 0, "order": 0})
            exact = f.get("exact", 0) or 0
            if wordstat and exact < min_freq_exact:
                continue
            db.add(SemanticKeyword(
                semantic_project_id=sem_id,
                phrase=phrase,
                frequency_base=f.get("base"),
                frequency_phrase=f.get("phrase_freq"),
                frequency_exact=f.get("exact"),
                frequency_order=f.get("order"),
                kw_type=_kw_type(exact),
                source="claude",
                is_mask=False,
                mask_selected=False,
            ))
            saved += 1

        sp.pipeline_step = max(sp.pipeline_step, 2)
        db.commit()

        if task:
            task.status = TaskStatus.SUCCESS
            task.progress = 100
            task.result = {"saved": saved, "generated": len(unique_phrases), "masks_used": total_masks}
            task.finished_at = datetime.now(timezone.utc)
            db.commit()

        return {"status": "success", "saved": saved}

    except Exception as e:
        from app.services.claude import LLMBillingError
        if task:
            task.status = TaskStatus.FAILED
            task.error = str(e)[:1500]
            task.finished_at = datetime.now(timezone.utc)
            db.commit()
        # Don't retry billing/auth errors — they won't resolve on their own
        if isinstance(e, LLMBillingError):
            return {"status": "failed", "error": str(e)}
        raise self.retry(exc=e)
    finally:
        db.close()


# ─── Cluster ──────────────────────────────────────────────────────────────────

_CLUSTER_SYSTEM = """Ты — специалист по семантическому ядру и структуре рекламных кампаний.
Сгруппируй ключевые слова в логические кластеры по смыслу и интенту.
Отвечай строго JSON-массивом объектов. Никакого другого текста."""


def _build_cluster_prompt(
    phrases: list[str],
    mode: str,
    target_clusters: int,
    region: str | None,
) -> str:
    region_hint = f" (регион: {region})" if region else ""
    mode_hint = "SEO-продвижения" if mode == "seo" else "Яндекс Директ"
    direct_fields = (
        '\n- campaign_type: "search" или "rsa"'
        '\n- suggested_title: заголовок объявления до 35 символов'
    ) if mode == "direct" else ""
    base_format = '{"name":"...","intent":"...","priority":"..."' + (
        ',"campaign_type":"...","suggested_title":"..."' if mode == "direct" else ""
    ) + ',"keywords":["..."]}'

    kw_list = "\n".join(f"- {p}" for p in phrases)
    return (
        f"Проект для {mode_hint}{region_hint}.\n"
        f"Сгруппируй {len(phrases)} ключевых слов в {target_clusters} кластеров.\n\n"
        f"Ключевые слова:\n{kw_list}\n\n"
        f"Для каждого кластера укажи:\n"
        f"- name: краткое название кластера\n"
        f"- intent: коммерческий | информационный | навигационный | общий\n"
        f"- priority: высокий | средний | низкий\n"
        f"{direct_fields}\n"
        f"- keywords: массив фраз из входного списка (каждая фраза — ровно как в списке)\n\n"
        f"Верни ТОЛЬКО JSON-массив. Формат строки: {base_format}"
    )


def _parse_cluster_json(text: str) -> list[dict]:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        return []
    try:
        data = json.loads(text[start : end + 1])
        return [d for d in data if isinstance(d, dict) and "name" in d]
    except json.JSONDecodeError:
        return []


@celery_app.task(
    bind=True,
    name="tasks.marketing.semantic_cluster",
    max_retries=2,
    default_retry_delay=10,
)
def task_semantic_cluster(self, task_id: str, sem_project_id: str, project_id: str):
    import logging  # noqa: PLC0415

    from sqlalchemy import select  # noqa: PLC0415

    from app.db.session import SessionLocal  # noqa: PLC0415
    from app.models.marketing import SemanticCluster, SemanticKeyword, SemanticProject  # noqa: PLC0415
    from app.models.task import Task, TaskStatus  # noqa: PLC0415
    from app.services.claude import get_claude_client  # noqa: PLC0415

    logger = logging.getLogger(__name__)
    db = SessionLocal()
    task = None
    try:
        task = db.get(Task, uuid.UUID(task_id))
        if task:
            task.status = TaskStatus.RUNNING
            task.progress = 0
            db.commit()

        sem_id = uuid.UUID(sem_project_id)
        sp = db.get(SemanticProject, sem_id)
        if not sp:
            raise RuntimeError(f"SemanticProject {sem_project_id} not found")

        # ── Load active (non-excluded) non-mask keywords ──────────────────────
        keywords = db.scalars(
            select(SemanticKeyword).where(
                SemanticKeyword.semantic_project_id == sem_id,
                SemanticKeyword.is_mask.is_(False),
                SemanticKeyword.is_excluded.is_(False),
            ).order_by(SemanticKeyword.frequency_exact.desc().nullslast())
        ).all()

        if not keywords:
            raise RuntimeError("Нет активных ключей для кластеризации. Выполните шаги 2–4.")

        phrases = [kw.phrase for kw in keywords]
        # Cap at 600 to keep Claude prompt manageable
        cap = 600
        if len(phrases) > cap:
            logger.warning("Capping cluster input from %d to %d phrases", len(phrases), cap)
            phrases = phrases[:cap]

        if task:
            task.progress = 10
            db.commit()

        # ── Call Claude in batches of 300 ─────────────────────────────────────
        claude = get_claude_client(db, task_type="semantic_cluster")
        from app.services.settings_service import get_prompt as _gp
        cluster_system = _gp("semantic_cluster", db) or _CLUSTER_SYSTEM
        all_clusters: list[dict] = []
        batch_size = 300
        phrase_set = set(phrases)

        for i in range(0, len(phrases), batch_size):
            batch = phrases[i : i + batch_size]
            target_n = max(3, len(batch) // 12)  # ~12 keywords per cluster
            prompt = _build_cluster_prompt(
                phrases=batch,
                mode=sp.mode.value,
                target_clusters=target_n,
                region=sp.region,
            )
            try:
                raw = _run_async(claude.generate(cluster_system, prompt))
                clusters = _parse_cluster_json(raw)
                all_clusters.extend(clusters)
            except Exception as exc:
                logger.warning("Claude cluster error for batch %d: %s", i, exc)

            if task:
                task.progress = int(10 + (i + batch_size) / len(phrases) * 70)
                db.commit()

        if task:
            task.progress = 80
            db.commit()

        # ── Persist clusters ──────────────────────────────────────────────────
        # Delete old clusters for this semantic project
        old_clusters = db.scalars(
            select(SemanticCluster).where(SemanticCluster.semantic_project_id == sem_id)
        ).all()
        for oc in old_clusters:
            db.delete(oc)
        db.flush()

        # Reset cluster_name on all keywords
        for kw in db.scalars(
            select(SemanticKeyword).where(SemanticKeyword.semantic_project_id == sem_id)
        ).all():
            kw.cluster_name = None

        # Build phrase→keyword map for quick lookup
        phrase_to_kw: dict[str, SemanticKeyword] = {}
        for kw in keywords:
            phrase_to_kw[kw.phrase] = kw

        saved_clusters = 0
        unclustered: set[str] = set(phrases)

        for cluster_data in all_clusters:
            name = str(cluster_data.get("name", "")).strip()
            if not name:
                continue
            cluster_kw_phrases = [
                p for p in (cluster_data.get("keywords") or [])
                if isinstance(p, str) and p in phrase_set
            ]
            if not cluster_kw_phrases:
                continue

            cluster = SemanticCluster(
                semantic_project_id=sem_id,
                name=name,
                intent=cluster_data.get("intent"),
                priority=cluster_data.get("priority"),
                campaign_type=cluster_data.get("campaign_type"),
                suggested_title=cluster_data.get("suggested_title"),
            )
            db.add(cluster)
            db.flush()  # get cluster.id

            for phrase in cluster_kw_phrases:
                if phrase in phrase_to_kw:
                    phrase_to_kw[phrase].cluster_name = name
                    unclustered.discard(phrase)

            saved_clusters += 1

        # Any unclustered phrases → put in "Прочее" cluster
        if unclustered:
            misc = SemanticCluster(
                semantic_project_id=sem_id,
                name="Прочее",
                intent="общий",
                priority="низкий",
            )
            db.add(misc)
            for phrase in unclustered:
                if phrase in phrase_to_kw:
                    phrase_to_kw[phrase].cluster_name = "Прочее"

        sp.pipeline_step = max(sp.pipeline_step, 4)
        db.commit()

        if task:
            task.status = TaskStatus.SUCCESS
            task.progress = 100
            task.result = {
                "clusters": saved_clusters,
                "clustered": len(phrases) - len(unclustered),
                "unclustered": len(unclustered),
            }
            task.finished_at = datetime.now(timezone.utc)
            db.commit()

        return {"status": "success", "clusters": saved_clusters}

    except Exception as e:
        from app.services.claude import LLMBillingError
        if task:
            task.status = TaskStatus.FAILED
            task.error = str(e)[:1500]
            task.finished_at = datetime.now(timezone.utc)
            db.commit()
        if isinstance(e, LLMBillingError):
            return {"status": "failed", "error": str(e)}
        raise self.retry(exc=e)
    finally:
        db.close()

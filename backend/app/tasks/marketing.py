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
    lines.append("\nСгенерируй 200–300 поисковых запросов. Включи:")
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

        # ── Wordstat: collect suggestions (nested + similar) per mask ──────
        import logging
        logger = logging.getLogger(__name__)

        total_masks = len(mask_phrases)
        all_phrases: list[str] = []
        seen: set[str] = set(p.lower() for p in mask_phrases)
        ws_suggestions_count = 0

        wordstat_for_suggestions = get_wordstat_client(db)
        if wordstat_for_suggestions:
            logger.info("Collecting Wordstat suggestions for %d masks", total_masks)
            for idx, mask in enumerate(mask_phrases):
                try:
                    suggestions = _run_async(
                        wordstat_for_suggestions.get_suggestions(
                            mask,
                            regions=[sp.region_id] if sp.region_id else None,
                            num_phrases=200,
                        )
                    )
                    for item in suggestions.get("nested", []):
                        p = item["phrase"].strip().lower()
                        if p and p not in seen:
                            seen.add(p)
                            all_phrases.append(p)
                            ws_suggestions_count += 1
                    for item in suggestions.get("similar", []):
                        p = item["phrase"].strip().lower()
                        if p and p not in seen:
                            seen.add(p)
                            all_phrases.append(p)
                            ws_suggestions_count += 1
                except Exception as exc:
                    logger.warning("Wordstat suggestions error for mask '%s': %s", mask, exc)

                if task:
                    task.progress = int(5 + (idx + 1) / total_masks * 10)  # 5→15
                    db.commit()

            logger.info("Wordstat suggestions: %d unique phrases collected", ws_suggestions_count)
        else:
            logger.warning("Wordstat not configured — skipping suggestions")

        if task:
            task.progress = 15
            db.commit()

        # ── Claude: generate keywords per mask ───────────────────────────────
        MIN_TARGET_KEYWORDS = 300

        claude = get_claude_client(db, task_type="semantic_expand")
        from app.services.settings_service import get_prompt
        expand_system = get_prompt("semantic_expand", db) or _EXPAND_SYSTEM
        mask_errors: list[str] = []
        masks_ok = 0

        logger.info(
            "Expanding %d masks (model=%s, max_tokens=%s), already have %d from Wordstat",
            total_masks, claude.model, claude.max_tokens, ws_suggestions_count,
        )

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
                    for p in phrases:
                        if p not in seen:
                            seen.add(p)
                            all_phrases.append(p)
                else:
                    mask_errors.append(f"'{mask}': пустой результат парсинга (ответ {len(raw or '')} символов)")
            except Exception as exc:
                from app.services.claude import LLMBillingError
                logger.warning("Claude error for mask '%s': %s", mask, exc)
                mask_errors.append(f"'{mask}': {exc}")
                if isinstance(exc, LLMBillingError):
                    raise

            if task:
                task.progress = int(15 + (idx + 1) / total_masks * 25)  # 15→40
                db.commit()

        logger.info(
            "After pass 1: %d unique phrases (Wordstat: %d, Claude: %d)",
            len(all_phrases), ws_suggestions_count, len(all_phrases) - ws_suggestions_count,
        )

        # ── Iterative expansion: if < MIN_TARGET, do additional Claude passes ──
        if len(all_phrases) < MIN_TARGET_KEYWORDS and masks_ok > 0:
            max_extra_passes = 2
            for pass_num in range(1, max_extra_passes + 1):
                if len(all_phrases) >= MIN_TARGET_KEYWORDS:
                    break
                logger.info(
                    "Extra pass %d: have %d, need %d more",
                    pass_num, len(all_phrases), MIN_TARGET_KEYWORDS - len(all_phrases),
                )
                for mask in mask_phrases:
                    if len(all_phrases) >= MIN_TARGET_KEYWORDS:
                        break
                    # Show Claude what we already have so it generates NEW ones
                    existing_sample = list(seen)[:200]
                    extra_prompt = (
                        f'Расширь маску «{mask}» для '
                        f'{"SEO-продвижения" if sp.mode.value == "seo" else "Яндекс Директ"}.\n\n'
                        f'УЖЕ СОБРАННЫЕ запросы (НЕ повторяй их):\n'
                        f'{json.dumps(existing_sample, ensure_ascii=False)}\n\n'
                        f'Сгенерируй ещё 100–200 НОВЫХ запросов, которых нет в списке выше.\n'
                        f'Используй:\n'
                        f'- Синонимы и переформулировки\n'
                        f'- Длиннохвостые запросы (3-5 слов)\n'
                        f'- Вопросительные формы (как, где, сколько, какой)\n'
                        f'- Модификаторы (цена, стоимость, отзывы, рейтинг, сравнение)\n'
                        f'- Географические вариации\n'
                        f'- Сезонные и временные (2024, 2025, зимой, летом)\n\n'
                        f'Верни ТОЛЬКО JSON-массив строк.'
                    )
                    try:
                        raw = _run_async(claude.generate(expand_system, extra_prompt))
                        phrases = _parse_json_array(raw)
                        new_count = 0
                        for p in phrases:
                            if p not in seen:
                                seen.add(p)
                                all_phrases.append(p)
                                new_count += 1
                        logger.info("Extra pass %d, mask '%s': +%d new phrases", pass_num, mask, new_count)
                    except Exception as exc:
                        from app.services.claude import LLMBillingError
                        logger.warning("Extra pass error for '%s': %s", mask, exc)
                        if isinstance(exc, LLMBillingError):
                            break

                if task:
                    task.progress = int(40 + pass_num / max_extra_passes * 10)  # 40→50
                    db.commit()

        unique_phrases = all_phrases  # already deduplicated via `seen`

        logger.info(
            "Total: %d unique phrases (Wordstat suggestions: %d)",
            len(unique_phrases), ws_suggestions_count,
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
                        task.progress = min(85, int(50 + (i + sub_batch) / len(uncached) * 35))
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
            task.result = {
                "saved": saved,
                "generated": len(unique_phrases),
                "from_wordstat": ws_suggestions_count,
                "from_claude": len(unique_phrases) - ws_suggestions_count,
                "masks_used": total_masks,
            }
            task.finished_at = datetime.now(timezone.utc)
            db.commit()

        # Push notification
        try:
            from app.services.push import notify_project_owner
            notify_project_owner(
                db, uuid.UUID(project_id),
                "Расширение семантики готово",
                f"Собрано {saved} ключевых слов",
            )
        except Exception:
            pass

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
                task.progress = min(80, int(10 + (i + batch_size) / len(phrases) * 70))
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

        # Push notification
        try:
            from app.services.push import notify_project_owner
            notify_project_owner(
                db, uuid.UUID(project_id),
                "Кластеризация готова",
                f"Создано {saved_clusters} кластеров",
            )
        except Exception:
            pass

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


# ─── Mask Generation from Brief ──────────────────────────────────────────────

_MASKS_SYSTEM = """Ты — специалист по сбору семантического ядра для Яндекс и Google.
Твоя задача — на основе описания бизнеса сгенерировать базовые маски (корневые поисковые запросы из 1–3 слов).
Отвечай строго JSON-массивом строк на русском языке. Никакого другого текста."""


def _build_masks_prompt(
    niche: str | None, products: str | None, target_audience: str | None,
    pains: str | None, usp: str | None, geo: str | None, mode: str,
) -> str:
    mode_hint = "SEO-продвижения (включай информационные и коммерческие)" if mode == "seo" else "Яндекс Директ (только коммерческие)"
    lines = [f"Сгенерируй базовые маски (корневые поисковые запросы из 1–3 слов) для {mode_hint}."]
    if niche:
        lines.append(f"\nНиша: {niche}")
    if products:
        lines.append(f"Продукты/услуги: {products}")
    if target_audience:
        lines.append(f"Целевая аудитория: {target_audience}")
    if pains:
        lines.append(f"Боли аудитории: {pains}")
    if usp:
        lines.append(f"УТП: {usp}")
    if geo:
        lines.append(f"Регион: {geo}")
    lines.append("\nСгенерируй 10–20 масок. Каждая маска — 1–3 слова.")
    lines.append("Включи: основные продукты/услуги, типы запросов (купить, заказать, цена), категории.")
    if mode == "seo":
        lines.append("Также включи информационные маски: как выбрать, обзор, плюсы и минусы.")
    lines.append('\nВерни ТОЛЬКО JSON-массив. Пример: ["купить диван", "диван цена", "мягкая мебель"]')
    return "\n".join(lines)


# ─── Autopilot Task ──────────────────────────────────────────────────────────

def _kw_type_classify(exact: int) -> str | None:
    if exact >= 1000:
        return "ВЧ"
    if exact >= 100:
        return "СЧ"
    if exact >= 1:
        return "НЧ"
    return None


@celery_app.task(bind=True, name="tasks.marketing.semantic_autopilot", max_retries=0)
def task_semantic_autopilot(self, task_id: str, sem_project_id: str, project_id: str, min_freq_exact: int = 0):
    """Full semantic pipeline: brief -> masks -> expand -> clean -> cluster."""
    import logging

    from sqlalchemy import select

    from app.db.session import SessionLocal
    from app.models.brief import Brief
    from app.models.marketing import KeywordCache, MarketingMinusWord, SemanticCluster, SemanticKeyword, SemanticProject
    from app.models.task import Task, TaskStatus
    from app.services.claude import LLMBillingError, get_claude_client
    from app.services.settings_service import get_prompt
    from app.services.wordstat import get_wordstat_client

    logger = logging.getLogger(__name__)
    db = SessionLocal()
    task = None
    try:
        task = db.get(Task, uuid.UUID(task_id))
        if task:
            task.status = TaskStatus.RUNNING
            task.progress = 0
            task.result = {"stage": "masks", "stage_label": "Генерация масок из бриф"}
            db.commit()

        sem_id = uuid.UUID(sem_project_id)
        sp = db.get(SemanticProject, sem_id)
        if not sp:
            raise RuntimeError(f"SemanticProject {sem_project_id} not found")

        brief = db.scalar(select(Brief).where(Brief.project_id == uuid.UUID(project_id)))
        if not brief or not (brief.niche or brief.products):
            raise RuntimeError("Бриф не заполнен. Укажите хотя бы нишу или продукты перед запуском автопилота.")

        # ── Phase 1: Generate masks from brief (0-10%) ────────────────────
        claude_m = get_claude_client(db, task_type="semantic_masks")
        sys_m = get_prompt("semantic_masks", db) or _MASKS_SYSTEM
        prompt_m = _build_masks_prompt(
            niche=brief.niche, products=brief.products, target_audience=brief.target_audience,
            pains=brief.pains, usp=brief.usp, geo=brief.geo or sp.region, mode=sp.mode.value,
        )
        mask_phrases = _parse_json_array(_run_async(claude_m.generate(sys_m, prompt_m)))
        if not mask_phrases:
            raise RuntimeError("ИИ не сгенерировал масок. Заполните бриф подробнее.")
        logger.info("Autopilot: %d masks from brief", len(mask_phrases))
        _update_task(task, 10, {"stage": "wordstat_masks", "stage_label": "Частотность масок", "masks": len(mask_phrases)}, db)

        # ── Phase 2: Wordstat for masks (10-20%) ──────────────────────────
        wordstat = get_wordstat_client(db)
        mask_freq: dict[str, dict] = {}
        wordstat_ok = False
        if wordstat:
            try:
                regions = [sp.region_id] if sp.region_id else None
                mask_freq = _run_async(wordstat.get_all_frequencies(mask_phrases, regions=regions))
                wordstat_ok = bool(mask_freq)
            except Exception as exc:
                logger.warning("Wordstat masks error: %s", exc)

        # Save masks
        for m in db.scalars(select(SemanticKeyword).where(SemanticKeyword.semantic_project_id == sem_id, SemanticKeyword.is_mask.is_(True))).all():
            db.delete(m)
        db.flush()
        for phrase in mask_phrases:
            f = mask_freq.get(phrase, {"base": 0, "phrase_freq": 0, "exact": 0, "order": 0})
            exact = f.get("exact", 0) or 0
            db.add(SemanticKeyword(
                semantic_project_id=sem_id, phrase=phrase,
                frequency_base=f.get("base"), frequency_phrase=f.get("phrase_freq"),
                frequency_exact=f.get("exact"), frequency_order=f.get("order"),
                kw_type=_kw_type_classify(exact), source="wordstat",
                is_mask=True, mask_selected=exact > 0 or not wordstat_ok,
            ))
        sp.pipeline_step = max(sp.pipeline_step, 1)
        db.commit()

        sel = [m.phrase for m in db.scalars(select(SemanticKeyword).where(
            SemanticKeyword.semantic_project_id == sem_id, SemanticKeyword.is_mask.is_(True), SemanticKeyword.mask_selected.is_(True),
        )).all()]
        if not sel:
            raise RuntimeError("Все маски — нулевая частотность. Проверьте Wordstat-токен или бриф.")
        _update_task(task, 20, {"stage": "expand", "stage_label": "Расширение", "masks": len(mask_phrases), "masks_selected": len(sel)}, db)

        # ── Phase 3: Expand (20-55%) ──────────────────────────────────────
        claude_e = get_claude_client(db, task_type="semantic_expand")
        sys_e = get_prompt("semantic_expand", db) or _EXPAND_SYSTEM
        bc_parts = [x for x in [
            f"Ниша: {brief.niche}" if brief.niche else None,
            f"Продукты: {brief.products}" if brief.products else None,
            f"Аудитория: {brief.target_audience}" if brief.target_audience else None,
            f"Боли: {brief.pains}" if brief.pains else None,
            f"УТП: {brief.usp}" if brief.usp else None,
        ] if x]
        brief_ctx = "\n".join(bc_parts) or None
        mods = brief.keyword_modifiers if hasattr(brief, "keyword_modifiers") and brief.keyword_modifiers else None

        # Site context
        site_ctx = None
        try:
            from app.models.crawl import CrawlSession, CrawlStatus, Page
            cr = db.scalar(select(CrawlSession).where(CrawlSession.project_id == uuid.UUID(project_id), CrawlSession.status == CrawlStatus.DONE).order_by(CrawlSession.finished_at.desc()))
            if cr:
                pages = db.scalars(select(Page).where(Page.crawl_session_id == cr.id, Page.status_code == 200).order_by(Page.word_count.desc()).limit(10)).all()
                if pages:
                    site_ctx = "\n".join(f"— {p.url}: {p.title or ''}" + (f" | H1: {p.h1}" if p.h1 else "") for p in pages)
        except Exception:
            pass

        all_ph: list[str] = []
        for idx, mask in enumerate(sel):
            pr = _build_expand_prompt(mask=mask, mode=sp.mode.value, region=sp.region, brief_context=brief_ctx, modifiers=mods, site_context=site_ctx)
            try:
                all_ph.extend(_parse_json_array(_run_async(claude_e.generate(sys_e, pr))))
            except LLMBillingError:
                raise
            except Exception as exc:
                logger.warning("Autopilot expand '%s': %s", mask, exc)
            if task:
                task.progress = int(20 + (idx + 1) / len(sel) * 35)
                db.commit()

        seen: set[str] = set(sel)
        uniq = []
        for p in all_ph:
            if p not in seen:
                seen.add(p)
                uniq.append(p)
        if not uniq:
            raise RuntimeError("ИИ не сгенерировал ключей. Проверьте API-ключ OpenRouter.")
        _update_task(task, 55, {"stage": "wordstat_kw", "stage_label": "Частотность ключей", "keywords": len(uniq)}, db)

        # ── Phase 4: Wordstat for keywords (55-75%) ───────────────────────
        kw_freq: dict[str, dict] = {}
        if wordstat and uniq:
            from datetime import timedelta

            from app.routers.marketing import CACHE_TTL_DAYS
            cutoff = datetime.now(tz=timezone.utc) - timedelta(days=CACHE_TTL_DAYS)
            cached = {r.phrase: r for r in db.scalars(select(KeywordCache).where(KeywordCache.phrase.in_(uniq), KeywordCache.region_id == sp.region_id, KeywordCache.cached_at > cutoff)).all()}
            uncached = [p for p in uniq if p not in cached]
            if uncached:
                regions = [sp.region_id] if sp.region_id else None
                for i in range(0, len(uncached), 250):
                    batch = uncached[i:i + 250]
                    try:
                        fresh = _run_async(wordstat.get_all_frequencies(batch, regions=regions))
                        now_ts = datetime.now(tz=timezone.utc)
                        for ph, fr in fresh.items():
                            kw_freq[ph] = fr
                            ex = db.scalar(select(KeywordCache).where(KeywordCache.phrase == ph, KeywordCache.region_id == sp.region_id))
                            if ex:
                                ex.frequency_base, ex.frequency_phrase, ex.frequency_exact, ex.frequency_order, ex.cached_at = fr["base"], fr["phrase_freq"], fr["exact"], fr["order"], now_ts
                            else:
                                db.add(KeywordCache(phrase=ph, region_id=sp.region_id, frequency_base=fr["base"], frequency_phrase=fr["phrase_freq"], frequency_exact=fr["exact"], frequency_order=fr["order"], cached_at=now_ts))
                    except Exception as exc:
                        logger.warning("WS batch: %s", exc)
                    if task:
                        task.progress = min(75, int(55 + (i + 250) / max(len(uncached), 1) * 20))
                        db.commit()
            for ph in uniq:
                if ph not in kw_freq and ph in cached:
                    c = cached[ph]
                    kw_freq[ph] = {"base": c.frequency_base or 0, "phrase_freq": c.frequency_phrase or 0, "exact": c.frequency_exact or 0, "order": c.frequency_order or 0}

        # Save keywords
        for kw in db.scalars(select(SemanticKeyword).where(SemanticKeyword.semantic_project_id == sem_id, SemanticKeyword.is_mask.is_(False))).all():
            db.delete(kw)
        db.flush()
        saved = 0
        for ph in uniq:
            f = kw_freq.get(ph, {"base": 0, "phrase_freq": 0, "exact": 0, "order": 0})
            ex = f.get("exact", 0) or 0
            if wordstat and min_freq_exact > 0 and ex < min_freq_exact:
                continue
            db.add(SemanticKeyword(semantic_project_id=sem_id, phrase=ph, frequency_base=f.get("base"), frequency_phrase=f.get("phrase_freq"), frequency_exact=f.get("exact"), frequency_order=f.get("order"), kw_type=_kw_type_classify(ex), source="claude", is_mask=False, mask_selected=False))
            saved += 1
        sp.pipeline_step = max(sp.pipeline_step, 2)
        db.commit()
        _update_task(task, 75, {"stage": "clean", "stage_label": "Авто-очистка", "saved": saved}, db)

        # ── Phase 5: Auto-clean (75-80%) ──────────────────────────────────
        mw_list = [mw.word.lower() for mw in db.scalars(select(MarketingMinusWord).where(MarketingMinusWord.semantic_project_id == sem_id)).all()]
        act = db.scalars(select(SemanticKeyword).where(SemanticKeyword.semantic_project_id == sem_id, SemanticKeyword.is_mask.is_(False), SemanticKeyword.is_excluded.is_(False))).all()
        excl = 0
        now_ts2 = datetime.now(timezone.utc)
        for kw in act:
            r = None
            if (kw.frequency_exact or 0) == 0 and not sp.is_seasonal:
                r = "zero"
            if r is None and len(kw.phrase.split()) > 7:
                r = "long"
            if r is None and mw_list:
                for mw in mw_list:
                    if mw in kw.phrase.lower().split():
                        r = "minus"
                        break
            if r:
                kw.is_excluded = True
                kw.excluded_at = now_ts2
                excl += 1
        sp.pipeline_step = max(sp.pipeline_step, 3)
        db.commit()
        kept = len(act) - excl
        _update_task(task, 80, {"stage": "cluster", "stage_label": "Кластеризация", "saved": saved, "excluded": excl, "kept": kept}, db)

        # ── Phase 6: Cluster (80-95%) ─────────────────────────────────────
        ckws = db.scalars(select(SemanticKeyword).where(SemanticKeyword.semantic_project_id == sem_id, SemanticKeyword.is_mask.is_(False), SemanticKeyword.is_excluded.is_(False)).order_by(SemanticKeyword.frequency_exact.desc().nullslast())).all()
        c_phrases = [k.phrase for k in ckws][:600]
        claude_c = get_claude_client(db, task_type="semantic_cluster")
        sys_c = get_prompt("semantic_cluster", db) or _CLUSTER_SYSTEM
        all_cl: list[dict] = []
        p_set = set(c_phrases)
        for i in range(0, len(c_phrases), 300):
            b = c_phrases[i:i + 300]
            try:
                all_cl.extend(_parse_cluster_json(_run_async(claude_c.generate(sys_c, _build_cluster_prompt(phrases=b, mode=sp.mode.value, target_clusters=max(3, len(b) // 12), region=sp.region)))))
            except LLMBillingError:
                raise
            except Exception as exc:
                logger.warning("Autopilot cluster: %s", exc)
            if task:
                task.progress = min(95, int(80 + (i + len(b)) / max(len(c_phrases), 1) * 15))
                db.commit()

        for oc in db.scalars(select(SemanticCluster).where(SemanticCluster.semantic_project_id == sem_id)).all():
            db.delete(oc)
        db.flush()
        for kw in db.scalars(select(SemanticKeyword).where(SemanticKeyword.semantic_project_id == sem_id)).all():
            kw.cluster_name = None
        p2kw = {k.phrase: k for k in ckws}
        n_cl = 0
        unc: set[str] = set(c_phrases)
        for cd in all_cl:
            nm = str(cd.get("name", "")).strip()
            if not nm:
                continue
            kps = [p for p in (cd.get("keywords") or []) if isinstance(p, str) and p in p_set]
            if not kps:
                continue
            db.add(SemanticCluster(semantic_project_id=sem_id, name=nm, intent=cd.get("intent"), priority=cd.get("priority"), campaign_type=cd.get("campaign_type"), suggested_title=cd.get("suggested_title")))
            db.flush()
            for p in kps:
                if p in p2kw:
                    p2kw[p].cluster_name = nm
                    unc.discard(p)
            n_cl += 1
        if unc:
            db.add(SemanticCluster(semantic_project_id=sem_id, name="Прочее", intent="общий", priority="низкий"))
            for p in unc:
                if p in p2kw:
                    p2kw[p].cluster_name = "Прочее"
        sp.pipeline_step = max(sp.pipeline_step, 4)
        db.commit()

        # ── Done ──────────────────────────────────────────────────────────
        if task:
            task.status = TaskStatus.SUCCESS
            task.progress = 100
            task.result = {
                "stage": "done", "stage_label": "Готово",
                "masks": len(mask_phrases), "masks_selected": len(sel),
                "keywords_generated": len(uniq), "keywords_saved": saved,
                "excluded": excl, "kept": kept, "clusters": n_cl,
            }
            task.finished_at = datetime.now(timezone.utc)
            db.commit()
        logger.info("Autopilot done: %d masks -> %d kw -> %d kept -> %d clusters", len(mask_phrases), saved, kept, n_cl)

        # Push notification
        try:
            from app.services.push import notify_project_owner
            notify_project_owner(
                db, uuid.UUID(project_id),
                "Семантика готова",
                f"Собрано {kept} ключевых слов, {n_cl} кластеров",
            )
        except Exception:
            pass

        return {"status": "success", "clusters": n_cl, "kept": kept}

    except Exception as e:
        from app.services.claude import LLMBillingError as _BE
        if task:
            task.status = TaskStatus.FAILED
            task.error = str(e)[:1500]
            task.finished_at = datetime.now(timezone.utc)
            db.commit()
        if isinstance(e, _BE):
            return {"status": "failed", "error": str(e)}
        raise
    finally:
        db.close()


def _update_task(task, progress: int, result: dict, db) -> None:
    if task:
        task.progress = progress
        task.result = result
        db.commit()

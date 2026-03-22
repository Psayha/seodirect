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


def _ws_call_with_retry(fn, *args, max_retries: int = 3, **kwargs):
    """Call a Wordstat function with exponential backoff on 429/timeout errors.

    Returns result on success, or raises on final failure.
    """
    import time
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            return _run_async(fn(*args, **kwargs))
        except Exception as exc:
            last_exc = exc
            exc_str = str(exc).lower()
            is_retryable = "429" in exc_str or "quota" in exc_str or "timeout" in exc_str or "rate" in exc_str
            if is_retryable and attempt < max_retries:
                delay = 5 * (2 ** attempt)  # 5s, 10s, 20s
                logger.warning("Wordstat %s (attempt %d/%d), retrying in %ds: %s", fn.__name__, attempt + 1, max_retries + 1, delay, exc)
                time.sleep(delay)
            else:
                raise last_exc from None
    raise last_exc  # unreachable, but type-safe


# Max keywords to save per semantic project (prevents memory/DB explosion)
_MAX_KEYWORDS_TOTAL = 10_000


# ─── Morphological utilities (pymorphy3) ─────────────────────────────────────

def _get_morph():
    """Lazy-init pymorphy3 MorphAnalyzer (singleton)."""
    if not hasattr(_get_morph, "_instance"):
        import pymorphy3
        _get_morph._instance = pymorphy3.MorphAnalyzer()
    return _get_morph._instance


def _normalize_phrase(phrase: str) -> str:
    """Normalize phrase to canonical lemmatized form for dedup comparison.
    E.g. 'купить диваны недорого' → 'купить диван недорого'
    """
    import re
    morph = _get_morph()
    words = re.findall(r'[а-яёa-z0-9]+', phrase.lower())
    lemmas = []
    for w in words:
        parsed = morph.parse(w)
        if parsed:
            lemmas.append(parsed[0].normal_form)
        else:
            lemmas.append(w)
    return " ".join(sorted(lemmas))


def _deduplicate_morphological(phrases: list[str]) -> list[str]:
    """Remove morphological duplicates, keeping the first occurrence.
    E.g. keeps 'купить диван' and removes 'покупка дивана' (same lemmas).
    """
    seen_norm: set[str] = set()
    result: list[str] = []
    for phrase in phrases:
        norm = _normalize_phrase(phrase)
        if norm not in seen_norm:
            seen_norm.add(norm)
            result.append(phrase)
    return result


_GEO_INVARIANT_PREFIXES = frozenset({"санкт", "усть", "гусь", "орехово", "камень"})


def _inflect_geo(geo: str) -> str:
    """Inflect geo name to prepositional case for 'в + город'.
    E.g. 'Москва' → 'Москве', 'Санкт-Петербург' → 'Санкт-Петербурге'.
    Handles compound names and invariant prefixes (Санкт-, Усть-).
    """
    morph = _get_morph()
    tokens = geo.split()
    result = []
    for token in tokens:
        parts = token.split("-")
        if len(parts) > 1:
            # For hyphenated names, only inflect the last part
            # (Санкт-Петербург → Санкт-Петербурге, Ростов-на-Дону → Ростове-на-Доне)
            inflected_parts = []
            for i, part in enumerate(parts):
                if part.lower() in _GEO_INVARIANT_PREFIXES or part.lower() in ("на", "де"):
                    inflected_parts.append(part)
                else:
                    parsed = morph.parse(part)
                    if parsed:
                        infl = parsed[0].inflect({"loct"})
                        if infl:
                            out = infl.word
                            if part[0].isupper():
                                out = out[0].upper() + out[1:]
                            inflected_parts.append(out)
                        else:
                            inflected_parts.append(part)
                    else:
                        inflected_parts.append(part)
            result.append("-".join(inflected_parts))
        else:
            parsed = morph.parse(token)
            if parsed:
                infl = parsed[0].inflect({"loct"})
                if infl:
                    out = infl.word
                    if token[0].isupper():
                        out = out[0].upper() + out[1:]
                    result.append(out)
                else:
                    result.append(token)
            else:
                result.append(token)
    return " ".join(result)


# ─── Competitor keyword extraction from meta tags ────────────────────────────

def _extract_keywords_from_meta(soup) -> list[str]:
    """Extract candidate keyword phrases from page title, description, H1, H2.
    Splits on common separators and filters short/stopword-only fragments.
    """
    import re
    fragments: list[str] = []

    # Title — split by common SEO separators
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
        parts = re.split(r'[|—–\-:•·»«/\\]', title)
        fragments.extend(p.strip() for p in parts if p.strip())

    # Meta description — split into phrases
    desc_tag = soup.find("meta", attrs={"name": "description"})
    if desc_tag and desc_tag.get("content"):
        desc = desc_tag["content"].strip()
        # Split by sentence separators and commas
        parts = re.split(r'[.!?,;:—–]', desc)
        fragments.extend(p.strip() for p in parts if p.strip())

    # H1
    h1 = soup.find("h1")
    if h1:
        fragments.append(h1.get_text(strip=True))

    # H2s
    for h2 in soup.find_all("h2")[:10]:
        fragments.append(h2.get_text(strip=True))

    # Meta keywords tag (some sites still have it)
    kw_tag = soup.find("meta", attrs={"name": "keywords"})
    if kw_tag and kw_tag.get("content"):
        fragments.extend(k.strip() for k in kw_tag["content"].split(",") if k.strip())

    # Filter: keep 2-7 word phrases, skip very short or stopword-only
    result: list[str] = []
    seen: set[str] = set()
    for frag in fragments:
        clean = re.sub(r'[^\w\s-]', '', frag).strip().lower()
        words = clean.split()
        if 2 <= len(words) <= 7 and clean not in seen:
            # Skip if all words are stopwords
            meaningful = [w for w in words if w not in _STOP_WORDS_RU and len(w) > 2]
            if meaningful:
                seen.add(clean)
                result.append(clean)
    return result


# ─── Text sanitization for Claude prompts ────────────────────────────────────

def _sanitize_text(text: str, max_len: int = 300) -> str:
    """Strip HTML tags, control chars, and truncate text before injecting into Claude prompts.

    Prevents prompt injection via malicious competitor page titles/H1/descriptions.
    """
    import re
    if not text:
        return ""
    # Strip any remaining HTML tags
    text = re.sub(r"<[^>]+>", "", text)
    # Remove control characters except newlines/tabs
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    # Collapse multiple whitespace
    text = re.sub(r"\s+", " ", text).strip()
    # Truncate safely (no mid-character cut for UTF-8)
    return text[:max_len]


# ─── SERP parsing: autocomplete + related searches ──────────────────────────

# Realistic browser headers to avoid bot detection
_SUGGEST_HEADERS_YA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://yandex.ru/",
}
_SUGGEST_HEADERS_GOOGLE = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.google.com/",
}

# Safety limits
_SUGGEST_MAX_REQUESTS_TOTAL = 500  # absolute cap per autopilot run
_SUGGEST_DELAY_SECONDS = 0.5  # delay between requests (safe for Yandex/Google)
_SUGGEST_MAX_MASKS = 15  # limit masks to avoid excessive requests


async def _fetch_yandex_suggest(
    client: "httpx.AsyncClient", query: str, region_id: int | None = None,
) -> list[str]:
    """Fetch Yandex autocomplete suggestions for a query."""
    params = {"part": query, "lr": str(region_id or 213)}
    try:
        r = await client.get(
            "https://suggest.yandex.ru/suggest-ya.cgi",
            params=params, headers=_SUGGEST_HEADERS_YA,
        )
        if r.status_code == 429:
            logger.warning("Yandex Suggest rate limited (429), stopping")
            return []
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list) and len(data) > 1:
                return [s for s in data[1] if isinstance(s, str)]
    except Exception:
        pass
    return []


async def _fetch_google_suggest(
    client: "httpx.AsyncClient", query: str, lang: str = "ru", country: str = "ru",
) -> list[str]:
    """Fetch Google autocomplete suggestions."""
    params = {"q": query, "client": "firefox", "hl": lang, "gl": country}
    try:
        r = await client.get(
            "https://suggestqueries.google.com/complete/search",
            params=params, headers=_SUGGEST_HEADERS_GOOGLE,
        )
        if r.status_code == 429:
            logger.warning("Google Suggest rate limited (429), stopping")
            return []
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list) and len(data) > 1:
                return [s for s in data[1] if isinstance(s, str)]
    except Exception:
        pass
    return []


async def _collect_serp_suggestions(
    masks: list[str],
    region_id: int | None = None,
    use_google: bool = True,
) -> list[str]:
    """Collect autocomplete suggestions from Yandex + Google for all masks.

    Applies alphabet modifier technique: 'mask а', 'mask б', ... 'mask я'
    to extract more long-tail queries.

    Safety: max 500 requests total, 0.5s between each, max 15 masks.
    """
    import asyncio

    import httpx

    all_suggestions: list[str] = []
    seen: set[str] = set()
    request_count = 0

    _RU_LETTERS = "абвгдежзиклмнопрстуфхцчшщэюя"
    _QUESTION_PREFIXES = ["как ", "где ", "какой ", "сколько ", "что ", "почему ", "зачем "]

    def _add_unique(suggestions: list[str]):
        for s in suggestions:
            s_lower = s.strip().lower()
            if s_lower and s_lower not in seen and len(s_lower) < 200:
                seen.add(s_lower)
                all_suggestions.append(s_lower)

    # Cap masks to avoid 1000+ requests
    capped_masks = masks[:_SUGGEST_MAX_MASKS]

    # Single persistent client — reuses connections, avoids socket exhaustion
    async with httpx.AsyncClient(timeout=8, limits=httpx.Limits(max_connections=3, max_keepalive_connections=2)) as client:
        for mask in capped_masks:
            if request_count >= _SUGGEST_MAX_REQUESTS_TOTAL:
                logger.warning("SERP suggest: hit %d request cap, stopping", _SUGGEST_MAX_REQUESTS_TOTAL)
                break

            # Base query — Yandex
            ya_base = await _fetch_yandex_suggest(client, mask, region_id)
            _add_unique(ya_base)
            request_count += 1
            await asyncio.sleep(_SUGGEST_DELAY_SECONDS)

            # Base query — Google
            if use_google and request_count < _SUGGEST_MAX_REQUESTS_TOTAL:
                g_base = await _fetch_google_suggest(client, mask)
                _add_unique(g_base)
                request_count += 1
                await asyncio.sleep(_SUGGEST_DELAY_SECONDS)

            # Alphabet mining: 'mask а', 'mask б', ...
            for letter in _RU_LETTERS:
                if request_count >= _SUGGEST_MAX_REQUESTS_TOTAL:
                    break
                ya = await _fetch_yandex_suggest(client, f"{mask} {letter}", region_id)
                _add_unique(ya)
                request_count += 1
                await asyncio.sleep(_SUGGEST_DELAY_SECONDS)

            # Question modifiers: 'как mask', 'где mask', ...
            for prefix in _QUESTION_PREFIXES:
                if request_count >= _SUGGEST_MAX_REQUESTS_TOTAL:
                    break
                ya_q = await _fetch_yandex_suggest(client, f"{prefix}{mask}", region_id)
                _add_unique(ya_q)
                request_count += 1
                await asyncio.sleep(_SUGGEST_DELAY_SECONDS)

    logger.info(
        "SERP suggestions: collected %d unique phrases from %d masks (%d HTTP requests)",
        len(all_suggestions), len(capped_masks), request_count,
    )
    return all_suggestions


# ─── Content Gap integration for autopilot ────────────────────────────────────

async def _extract_content_gap_keywords(
    competitor_urls: list[str],
    client_pages: list[dict],
    brief_niche: str | None,
    db,
) -> list[str]:
    """Run a lightweight content gap analysis and extract keyword candidates.

    Crawls competitor pages, compares with client pages, asks Claude
    to generate keyword phrases for missing topics.

    Safety: SSRF on every URL + redirect hop, crawl delay 1s, connection limits.
    """
    import asyncio
    import logging
    import re

    import httpx
    from bs4 import BeautifulSoup

    logger = logging.getLogger(__name__)

    # Crawl competitor internal pages (up to 15 per site, max 3 sites)
    comp_pages: list[dict] = []
    async with httpx.AsyncClient(
        timeout=15,
        follow_redirects=False,  # manual redirect following via _safe_get
        headers={"User-Agent": "SEODirectBot/1.0 (internal)"},
        limits=httpx.Limits(max_connections=5, max_keepalive_connections=3),
    ) as client:
        for url in competitor_urls[:3]:
            if not _is_safe_url_crawl(url):
                logger.warning("Content gap: blocked unsafe URL %s", url)
                continue
            try:
                r = await _safe_get(client, url)
                if not r or r.status_code != 200:
                    continue
                soup = BeautifulSoup(r.text, "html.parser")
                title = _sanitize_text((soup.title.string or "").strip() if soup.title else "")
                h1 = soup.find("h1")
                h1_text = _sanitize_text(h1.get_text(strip=True) if h1 else "")
                comp_pages.append({"url": url, "title": title, "h1": h1_text})

                # Crawl internal pages
                from urllib.parse import urlparse
                parsed = urlparse(str(r.url))
                base = f"{parsed.scheme}://{parsed.netloc}"
                internal: set[str] = set()
                for a in soup.find_all("a", href=True):
                    href = a["href"]
                    if href.startswith("/") and not href.startswith("//"):
                        href = base + href
                    clean = href.split("?")[0].split("#")[0]
                    if clean.startswith(base) and clean != str(r.url) and _is_safe_url_crawl(clean):
                        internal.add(clean)

                for iurl in list(internal)[:15]:
                    await asyncio.sleep(1.0)  # crawl delay
                    try:
                        ir = await _safe_get(client, iurl)
                        if not ir or ir.status_code != 200:
                            continue
                        isoup = BeautifulSoup(ir.text, "html.parser")
                        it = _sanitize_text((isoup.title.string or "").strip() if isoup.title else "")
                        ih1 = isoup.find("h1")
                        ih1_t = _sanitize_text(ih1.get_text(strip=True) if ih1 else "")
                        if it or ih1_t:
                            comp_pages.append({"url": iurl, "title": it, "h1": ih1_t})
                    except Exception:
                        continue
            except Exception:
                continue

    if not comp_pages:
        return []

    # Ask Claude to extract keyword phrases from gaps
    from app.services.claude import get_claude_client

    try:
        claude = get_claude_client(db, task_type="semantic_content_gap")
    except Exception:
        logger.warning("Claude not available for content gap keyword extraction")
        return []

    client_list = "\n".join(
        f"- {p['url']}: {_sanitize_text(p.get('title', ''))} | {_sanitize_text(p.get('h1', ''))}"
        for p in client_pages[:30]
    )
    comp_list = "\n".join(
        f"- {p['url']}: {_sanitize_text(p.get('title', ''))} | {_sanitize_text(p.get('h1', ''))}"
        for p in comp_pages[:50]
    )

    prompt = f"""Ниша: {brief_niche or 'не указана'}

Страницы клиента:
{client_list or 'Нет данных'}

Страницы конкурентов:
{comp_list}

Найди темы/разделы, которые есть у конкурентов, но отсутствуют у клиента.
Для каждой найденной темы сгенерируй 3-5 поисковых запросов (ключевых фраз), по которым пользователи ищут эту тему.

Верни ТОЛЬКО JSON-массив строк — плоский список ключевых фраз.
Пример: ["ремонт кухни под ключ", "дизайн-проект кухни", "кухня на заказ цена"]"""

    system = "Ты — SEO-аналитик. Извлекай ключевые фразы из контентных пробелов. Отвечай строго JSON-массивом строк."
    try:
        raw = await claude.generate(system, prompt)
        keywords = _parse_json_array(raw)
        logger.info("Content gap: extracted %d keyword candidates", len(keywords))
        return keywords
    except Exception as exc:
        logger.warning("Content gap keyword extraction failed: %s", exc)
        return []


# ─── Topvisor clustering integration ─────────────────────────────────────────

async def _cluster_via_topvisor(
    phrases: list[str],
    project_id: int,
    api_key: str,
    user_id: str = "",
    timeout_seconds: int = 300,
) -> list[dict] | None:
    """Upload keywords to Topvisor, run SERP-based clustering, return groups.

    Returns list of {"group_id": str, "keywords": [str]} or None if failed/timeout.
    """
    import logging
    logger = logging.getLogger(__name__)

    from app.services.topvisor import (
        add_keywords_to_project,
        get_cluster_groups,
        remove_all_keywords,
        start_cluster_task,
        wait_for_clustering,
    )

    try:
        # Step 1: Upload keywords (additive — Topvisor deduplicates automatically)
        result = await add_keywords_to_project(api_key, project_id, phrases, user_id=user_id)
        logger.info("Topvisor cluster: uploaded %d keywords (added=%s)", len(phrases), result)

        # Step 3: Start clustering task
        start_result = await start_cluster_task(api_key, project_id, user_id)
        if not start_result.get("ok"):
            logger.warning("Topvisor cluster: failed to start — %s", start_result.get("message"))
            return None

        # Step 4: Wait for completion
        done = await wait_for_clustering(api_key, project_id, user_id, timeout_seconds=timeout_seconds)
        if not done:
            logger.warning("Topvisor cluster: timed out after %ds", timeout_seconds)
            return None

        # Step 5: Get cluster groups
        groups = await get_cluster_groups(api_key, project_id, user_id)
        logger.info("Topvisor cluster: got %d groups", len(groups))
        return groups

    except Exception as exc:
        logger.warning("Topvisor clustering failed: %s", exc)
        return None


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

        # Morphological deduplication
        before_morph = len(all_phrases)
        unique_phrases = _deduplicate_morphological(all_phrases)
        if before_morph != len(unique_phrases):
            logger.info("Morphological dedup: %d → %d phrases", before_morph, len(unique_phrases))

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
                        fresh = _ws_call_with_retry(wordstat.get_all_frequencies, batch, regions=regions)
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
        # No hard cap — process all keywords via multi-batch (300 per batch)
        if len(phrases) > 600:
            logger.info("Clustering %d phrases in multi-batch mode (300 per batch)", len(phrases))

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

            raw_st = cluster_data.get("suggested_title")
            cluster = SemanticCluster(
                semantic_project_id=sem_id,
                name=name[:255],
                intent=(cluster_data.get("intent") or "")[:50] or None,
                priority=(cluster_data.get("priority") or "")[:20] or None,
                campaign_type=(cluster_data.get("campaign_type") or "")[:50] or None,
                suggested_title=raw_st[:255] if raw_st else None,
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

_MASKS_SYSTEM = """Ты — опытный PPC/SEO-специалист по сбору семантического ядра для Яндекс и Google.
Твоя задача — сгенерировать ПОЛНЫЙ список базовых масок (корневые запросы 1–4 слова).

КРИТИЧЕСКИ ВАЖНО:
- Маска — это базис запроса БЕЗ модификаторов (цена/купить/недорого добавятся автоматически потом)
- Генерируй ПРОДУКТОВЫЕ маски: конкретные товары, услуги, их разновидности
- Включай ВСЕ СИНОНИМЫ одного и того же продукта/услуги
- Включай РАЗМЕРЫ, ХАРАКТЕРИСТИКИ, ПАРАМЕТРЫ (если применимо к нише)
- Включай ТИПЫ, ВИДЫ, КАТЕГОРИИ продуктов/услуг
- Включай НАЗНАЧЕНИЕ и ЦЕЛЕВУЮ АУДИТОРИЮ продукта
- Включай МАТЕРИАЛЫ, ТЕХНОЛОГИИ (если применимо)
- Включай ЭТАПЫ/СОСТАВНЫЕ ЧАСТИ услуги (если сложная услуга)
- НЕ добавляй коммерческие модификаторы (купить/цена/стоимость/недорого) — они будут добавлены отдельно через матрицу

Отвечай строго JSON-массивом строк на русском языке. Никакого другого текста."""


def _build_masks_prompt(
    niche: str | None, products: str | None, target_audience: str | None,
    pains: str | None, usp: str | None, geo: str | None, mode: str,
    competitor_context: str | None = None, site_context: str | None = None,
    example_masks: list[str] | None = None,
    mask_categories: list[str] | None = None,
    example_keywords: list[str] | None = None,
) -> str:
    mode_hint = "SEO-продвижения (информационные + коммерческие)" if mode == "seo" else "Яндекс Директ (коммерческие)"
    lines = [f"Сгенерируй ПОЛНЫЙ список базовых масок для {mode_hint}."]
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
    if site_context:
        lines.append(f"\nСтраницы сайта клиента (структура, услуги, товары):\n{site_context}")
    if competitor_context:
        lines.append(f"\nСтраницы конкурентов (какие услуги/товары продвигают):\n{competitor_context}")

    # Niche template data — proven starting points
    if example_masks:
        lines.append(f"\nПримеры масок для этой ниши (используй как отправную точку, дополни своими):\n{json.dumps(example_masks[:40], ensure_ascii=False)}")
    if mask_categories:
        lines.append("\nКатегории масок, которые ОБЯЗАТЕЛЬНО нужно покрыть:")
        for cat in mask_categories:
            lines.append(f"- {cat}")
    if example_keywords:
        lines.append(f"\nПримеры качественных финальных ключей (ориентир по стилю и детальности):\n{json.dumps(example_keywords[:15], ensure_ascii=False)}")

    lines.append("""
Сгенерируй 30–60 масок. Если выше даны примеры масок — расширь их, добавь недостающие.
Если примеров нет — сгенерируй с нуля, включи:
1. Основные продукты/услуги — ВСЕ синонимы и варианты названий
2. Разновидности по размеру/параметрам (если применимо к нише)
3. Разновидности по типу/виду/категории
4. Разновидности по назначению/целевой аудитории
5. Разновидности по материалу/технологии (если применимо)
6. Этапы/составные части услуги (если сложная услуга)
7. Готовые решения/комплекты (если применимо)

ВАЖНО: Анализируй данные сайта и конкурентов — какие конкретные товары/услуги/страницы есть.
Каждая маска — 1–4 слова. НЕ добавляй коммерческие модификаторы (купить/цена/стоимость/недорого/под ключ) — они будут добавлены автоматически.""")
    lines.append('\nВерни ТОЛЬКО JSON-массив строк.')
    return "\n".join(lines)


# ─── Competitor crawling for masks ───────────────────────────────────────────

_STOP_WORDS_RU = frozenset({
    "и", "в", "на", "с", "по", "для", "не", "от", "из", "к", "что", "это",
    "как", "но", "все", "или", "при", "так", "же", "уже", "бы", "да", "нет",
    "вы", "мы", "он", "она", "они", "его", "её", "их", "наш", "ваш", "мой",
    "свой", "этот", "тот", "весь", "быть", "который", "также", "более",
    "можно", "если", "когда", "только", "еще", "ещё", "где", "там", "здесь",
    "очень", "уже", "без", "будет", "был", "была", "были", "есть", "нас",
    "вас", "них", "ним", "ней", "того", "чем", "чего", "кто", "она",
})


def _extract_frequent_terms(soup, top_n: int = 25) -> list[str]:
    """Extract most frequent meaningful terms from page body."""
    import re
    from collections import Counter
    body = soup.find("body")
    if not body:
        return []
    for tag in body.find_all(["nav", "footer", "script", "style", "noscript", "header"]):
        tag.decompose()
    text = body.get_text(separator=" ", strip=True).lower()
    words = re.findall(r'[а-яё]{3,}', text)
    counter = Counter(w for w in words if w not in _STOP_WORDS_RU and len(w) > 3)
    return [w for w, _ in counter.most_common(top_n)]


def _is_safe_url_crawl(url: str) -> bool:
    """Block SSRF: reject internal IPs, non-http schemes, metadata endpoints."""
    import ipaddress
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = parsed.hostname or ""
        if not hostname:
            return False
        if hostname in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
            return False
        if hostname.endswith(".internal") or hostname.endswith(".local"):
            return False
        if hostname in ("169.254.169.254", "metadata.google.internal"):
            return False
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False
        except ValueError:
            pass
        return True
    except Exception:
        return False


async def _fetch_robots_crawl_delay(client: "httpx.AsyncClient", base_url: str) -> float:
    """Fetch robots.txt and extract Crawl-delay. Returns delay in seconds (default 1.0)."""
    try:
        r = await client.get(f"{base_url}/robots.txt")
        if r.status_code == 200:
            for line in r.text.splitlines():
                lower = line.strip().lower()
                if lower.startswith("crawl-delay:"):
                    try:
                        return max(1.0, float(lower.split(":", 1)[1].strip()))
                    except ValueError:
                        pass
    except Exception:
        pass
    return 1.0  # default: 1 second between requests


async def _safe_get(
    client: "httpx.AsyncClient", url: str, max_redirects: int = 3,
) -> "httpx.Response | None":
    """GET with manual redirect following + SSRF check on each hop."""
    import httpx
    current_url = url
    for _ in range(max_redirects + 1):
        if not _is_safe_url_crawl(current_url):
            logger.warning("Blocked SSRF attempt to %s", current_url)
            return None
        try:
            r = await client.get(current_url)
        except Exception:
            return None
        if r.status_code in (301, 302, 303, 307, 308):
            location = r.headers.get("location", "")
            if not location:
                return None
            # Resolve relative redirects
            if location.startswith("/"):
                from urllib.parse import urlparse
                parsed = urlparse(current_url)
                location = f"{parsed.scheme}://{parsed.netloc}{location}"
            current_url = location
            continue
        return r
    logger.warning("Too many redirects for %s", url)
    return None


async def _crawl_competitor_pages(
    urls: list[str], max_pages_per_site: int = 15,
) -> tuple[str, list[str]]:
    """Crawl competitor URLs, extract title/H1/H2/description/nav/anchors/terms.

    Safety: SSRF protection on every URL, robots.txt Crawl-delay respected,
    manual redirect following with hop validation, connection limits.

    Returns:
        (context_text, extracted_keywords) — context for Claude + keyword phrases from meta tags.
    """
    import asyncio

    import httpx
    from bs4 import BeautifulSoup

    lines: list[str] = []
    all_extracted_keywords: list[str] = []

    async with httpx.AsyncClient(
        timeout=15,
        follow_redirects=False,  # manual redirect following with SSRF checks
        headers={"User-Agent": "SEODirectBot/1.0 (internal)"},
        limits=httpx.Limits(max_connections=5, max_keepalive_connections=3),
    ) as client:
        for url in urls[:5]:  # max 5 competitors
            if not _is_safe_url_crawl(url):
                logger.warning("Competitor crawl: blocked unsafe URL %s", url)
                continue
            try:
                r = await _safe_get(client, url)
                if not r or r.status_code != 200:
                    continue

                # Respect robots.txt Crawl-delay
                from urllib.parse import urlparse
                parsed = urlparse(str(r.url))
                base = f"{parsed.scheme}://{parsed.netloc}"
                crawl_delay = await _fetch_robots_crawl_delay(client, base)

                soup = BeautifulSoup(r.text, "html.parser")
                title = (soup.title.string or "").strip() if soup.title else ""
                h1 = soup.find("h1")
                h1_text = h1.get_text(strip=True) if h1 else ""
                h2s = [h.get_text(strip=True) for h in soup.find_all("h2")[:10]]
                lines.append(f"URL: {url}")
                if title:
                    lines.append(f"  Title: {title}")
                if h1_text:
                    lines.append(f"  H1: {h1_text}")
                if h2s:
                    lines.append(f"  H2: {'; '.join(h2s)}")

                # Meta description
                desc_tag = soup.find("meta", attrs={"name": "description"})
                if desc_tag and desc_tag.get("content"):
                    lines.append(f"  Description: {desc_tag['content'][:300]}")

                # Extract keyword phrases from meta tags (homepage)
                homepage_kws = _extract_keywords_from_meta(soup)
                all_extracted_keywords.extend(homepage_kws)

                # Navigation structure
                for nav in soup.find_all("nav"):
                    nav_items = [a.get_text(strip=True) for a in nav.find_all("a") if a.get_text(strip=True)]
                    if nav_items:
                        lines.append(f"  Навигация: {' | '.join(nav_items[:30])}")
                        break

                # Internal link anchors
                anchors: list[str] = []
                internal_urls: set[str] = set()
                for a in soup.find_all("a", href=True):
                    href = a["href"]
                    if href.startswith("/") and not href.startswith("//"):
                        href = base + href
                    if href.startswith(base) and href != str(r.url):
                        text = a.get_text(strip=True)
                        if text and 2 < len(text) < 100:
                            anchors.append(text)
                        clean_href = href.split("?")[0].split("#")[0]
                        if len(internal_urls) < max_pages_per_site and _is_safe_url_crawl(clean_href):
                            internal_urls.add(clean_href)
                if anchors:
                    unique_anchors = list(dict.fromkeys(anchors))[:50]
                    lines.append(f"  Анкоры: {' | '.join(unique_anchors)}")

                # Frequent content terms
                terms = _extract_frequent_terms(BeautifulSoup(r.text, "html.parser"))
                if terms:
                    lines.append(f"  Частые термины: {', '.join(terms)}")

                # Crawl internal pages with delay
                for iurl in list(internal_urls)[:max_pages_per_site]:
                    await asyncio.sleep(crawl_delay)  # respect Crawl-delay
                    try:
                        ir = await _safe_get(client, iurl)
                        if not ir or ir.status_code != 200:
                            continue
                        isoup = BeautifulSoup(ir.text, "html.parser")
                        it = (isoup.title.string or "").strip() if isoup.title else ""
                        ih1 = isoup.find("h1")
                        ih1_text = ih1.get_text(strip=True) if ih1 else ""
                        idesc = isoup.find("meta", attrs={"name": "description"})
                        idesc_text = (idesc["content"][:200] if idesc and idesc.get("content") else "")
                        if it or ih1_text:
                            page_line = f"  Страница: {iurl} | {it} | H1: {ih1_text}"
                            if idesc_text:
                                page_line += f" | Desc: {idesc_text}"
                            lines.append(page_line)
                        page_kws = _extract_keywords_from_meta(isoup)
                        all_extracted_keywords.extend(page_kws)
                    except Exception:
                        continue
            except Exception:
                continue

    # Deduplicate extracted keywords
    seen: set[str] = set()
    unique_kws: list[str] = []
    for kw in all_extracted_keywords:
        if kw not in seen:
            seen.add(kw)
            unique_kws.append(kw)

    return ("\n".join(lines) if lines else "", unique_kws)


# ─── Modifiers matrix ────────────────────────────────────────────────────────

_DEFAULT_COMMERCIAL_MODIFIERS = [
    "купить", "заказать", "цена", "стоимость", "сколько стоит",
    "недорого", "дешево", "под ключ",
]

_DEFAULT_SEO_MODIFIERS = [
    "купить", "заказать", "цена", "стоимость", "сколько стоит",
    "недорого", "под ключ", "отзывы", "проекты",
    "плюсы и минусы", "как выбрать",
]


def _generate_modifier_matrix(bases: list[str], modifiers: list[str], geo: str | None = None) -> list[str]:
    """Cross-multiply base phrases with modifiers to get real search queries.
    Uses morphological inflection for geo names: 'в Москве' instead of 'в Москва'.
    """
    result: list[str] = []
    geo_loct = _inflect_geo(geo) if geo else None  # prepositional case
    for base in bases:
        for mod in modifiers:
            result.append(f"{base} {mod}")
            if geo:
                result.append(f"{base} {mod} {geo}")
        # base + geo without modifier
        if geo:
            result.append(f"{base} {geo}")
            if geo_loct and geo_loct.lower() != geo.lower():
                result.append(f"{base} в {geo_loct}")
            else:
                result.append(f"{base} в {geo}")
    return result


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
    """Full semantic pipeline: brief -> competitors -> masks -> wordstat suggestions -> matrix -> expand -> clean -> cluster."""
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
            task.result = {"stage": "competitors", "stage_label": "Анализ конкурентов и сайта"}
            db.commit()

        sem_id = uuid.UUID(sem_project_id)
        sp = db.get(SemanticProject, sem_id)
        if not sp:
            raise RuntimeError(f"SemanticProject {sem_project_id} not found")

        brief = db.scalar(select(Brief).where(Brief.project_id == uuid.UUID(project_id)))
        if not brief or not (brief.niche or brief.products):
            raise RuntimeError("Бриф не заполнен. Укажите хотя бы нишу или продукты перед запуском автопилота.")

        # ── Load niche template (auto-detect + per-project overrides) ────
        from app.data.niche_semantic_templates import NICHE_SEMANTIC_TEMPLATES, detect_niche
        niche_id = detect_niche(brief)
        niche_tmpl = dict(NICHE_SEMANTIC_TEMPLATES.get(niche_id, {})) if niche_id else None
        # Apply per-project overrides from sp.config
        sp_config = sp.config or {}
        override = sp_config.get("niche_template_override", {})
        if override:
            if niche_tmpl is None:
                niche_tmpl = {}
            for field in ("example_masks", "mask_categories", "example_keywords",
                          "negative_keywords_base", "modifiers_commercial", "modifiers_seo"):
                if field in override and override[field]:
                    niche_tmpl[field] = override[field]
        if niche_tmpl and not any(niche_tmpl.values()):
            niche_tmpl = None
        if niche_id:
            logger.info("Autopilot: detected niche '%s', template loaded (override=%s)", niche_id, bool(override))

        # ── Phase 0: Gather context — competitors + site (0-5%) ───────────
        competitor_ctx = ""
        competitor_keywords: list[str] = []
        if brief.competitors_urls:
            try:
                competitor_ctx, competitor_keywords = _run_async(_crawl_competitor_pages(brief.competitors_urls))
                logger.info(
                    "Autopilot: competitor context %d chars, %d extracted keywords from %d URLs",
                    len(competitor_ctx), len(competitor_keywords), len(brief.competitors_urls),
                )
            except Exception as exc:
                logger.warning("Autopilot competitor crawl: %s", exc)

        site_ctx = None
        try:
            from app.models.crawl import CrawlSession, CrawlStatus, Page
            cr = db.scalar(select(CrawlSession).where(CrawlSession.project_id == uuid.UUID(project_id), CrawlSession.status == CrawlStatus.DONE).order_by(CrawlSession.finished_at.desc()))
            if cr:
                pages = db.scalars(select(Page).where(Page.crawl_session_id == cr.id, Page.status_code == 200).order_by(Page.word_count.desc()).limit(20)).all()
                if pages:
                    site_ctx = "\n".join(f"— {p.url}: {p.title or ''}" + (f" | H1: {p.h1}" if p.h1 else "") for p in pages)
        except Exception:
            pass
        _update_task(task, 5, {"stage": "masks", "stage_label": "Генерация масок из бриф + конкуренты"}, db)

        # ── Phase 1: Generate masks from brief + competitors (5-10%) ──────
        claude_m = get_claude_client(db, task_type="semantic_masks")
        sys_m = get_prompt("semantic_masks", db) or _MASKS_SYSTEM
        prompt_m = _build_masks_prompt(
            niche=brief.niche, products=brief.products, target_audience=brief.target_audience,
            pains=brief.pains, usp=brief.usp, geo=brief.geo or sp.region, mode=sp.mode.value,
            competitor_context=competitor_ctx or None, site_context=site_ctx,
            example_masks=niche_tmpl.get("example_masks") if niche_tmpl else None,
            mask_categories=niche_tmpl.get("mask_categories") if niche_tmpl else None,
            example_keywords=niche_tmpl.get("example_keywords") if niche_tmpl else None,
        )
        mask_phrases = _parse_json_array(_run_async(claude_m.generate(sys_m, prompt_m)))
        if not mask_phrases:
            raise RuntimeError("ИИ не сгенерировал масок. Заполните бриф подробнее.")
        logger.info("Autopilot: %d masks from brief+competitors", len(mask_phrases))
        _update_task(task, 10, {"stage": "wordstat_masks", "stage_label": "Частотность масок", "masks": len(mask_phrases)}, db)

        # ── Phase 2: Wordstat for masks (10-15%) ─────────────────────────
        wordstat = get_wordstat_client(db)
        mask_freq: dict[str, dict] = {}
        wordstat_ok = False
        regions = [sp.region_id] if sp.region_id else None
        if wordstat:
            try:
                mask_freq = _ws_call_with_retry(wordstat.get_all_frequencies, mask_phrases, regions=regions)
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
        _update_task(task, 15, {"stage": "suggestions", "stage_label": "Сбор подсказок Wordstat", "masks": len(mask_phrases), "masks_selected": len(sel)}, db)

        # ── Phase 3: Wordstat suggestions — real search tails (15-35%) ────
        ws_suggestions: list[str] = []
        if wordstat:
            for idx, mask in enumerate(sel):
                try:
                    sug = _ws_call_with_retry(wordstat.get_suggestions, mask, regions=regions, num_phrases=200)
                    nested = sug.get("nested", [])
                    similar = sug.get("similar", [])
                    for item in nested:
                        ph = item.get("phrase", "").strip()
                        if ph:
                            ws_suggestions.append(ph)
                    for item in similar[:20]:  # limit similar to avoid noise
                        ph = item.get("phrase", "").strip()
                        if ph:
                            ws_suggestions.append(ph)
                    logger.info("Autopilot suggestions '%s': %d nested, %d similar", mask, len(nested), len(similar))
                except Exception as exc:
                    logger.warning("Autopilot suggestions '%s': %s", mask, exc)
                if task:
                    task.progress = int(15 + (idx + 1) / len(sel) * 20)
                    db.commit()
        logger.info("Autopilot: %d raw suggestions from Wordstat", len(ws_suggestions))

        # ── Phase 3b: SERP autocomplete (Yandex + Google suggest) ─────────
        _update_task(task, 33, {"stage": "serp_suggest", "stage_label": "Сбор подсказок из поисковой выдачи (Яндекс + Google)"}, db)
        serp_suggestions: list[str] = []
        try:
            serp_suggestions = _run_async(
                _collect_serp_suggestions(sel, region_id=sp.region_id, use_google=True)
            )
            logger.info("Autopilot: %d phrases from SERP autocomplete", len(serp_suggestions))
        except Exception as exc:
            logger.warning("Autopilot SERP suggest: %s", exc)

        # ── Phase 4: Modifier matrix (35-37%) ────────────────────────────
        _update_task(task, 35, {"stage": "matrix", "stage_label": "Генерация матрицы базис × модификатор", "suggestions": len(ws_suggestions)}, db)
        custom_mods = brief.keyword_modifiers if hasattr(brief, "keyword_modifiers") and brief.keyword_modifiers else None
        if custom_mods:
            modifiers = custom_mods
        elif niche_tmpl:
            if sp.mode.value == "seo":
                modifiers = niche_tmpl.get("modifiers_seo", _DEFAULT_SEO_MODIFIERS)
            else:
                modifiers = niche_tmpl.get("modifiers_commercial", _DEFAULT_COMMERCIAL_MODIFIERS)
        elif sp.mode.value == "seo":
            modifiers = _DEFAULT_SEO_MODIFIERS
        else:
            modifiers = _DEFAULT_COMMERCIAL_MODIFIERS
        geo_for_matrix = brief.geo or sp.region
        matrix_phrases = _generate_modifier_matrix(sel, modifiers, geo=geo_for_matrix)
        logger.info("Autopilot: %d phrases from modifier matrix", len(matrix_phrases))
        _update_task(task, 37, {"stage": "expand", "stage_label": "ИИ-расширение семантики", "matrix": len(matrix_phrases)}, db)

        # ── Phase 5: AI Expand — additional keywords (37-50%) ─────────────
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

        ai_phrases: list[str] = []
        for idx, mask in enumerate(sel):
            pr = _build_expand_prompt(mask=mask, mode=sp.mode.value, region=sp.region, brief_context=brief_ctx, modifiers=custom_mods, site_context=site_ctx)
            try:
                ai_phrases.extend(_parse_json_array(_run_async(claude_e.generate(sys_e, pr))))
            except LLMBillingError:
                raise
            except Exception as exc:
                logger.warning("Autopilot expand '%s': %s", mask, exc)
            if task:
                task.progress = int(37 + (idx + 1) / len(sel) * 13)
                db.commit()
        logger.info("Autopilot: %d phrases from AI expand", len(ai_phrases))

        # ── Phase 5b: Content Gap keywords (competitor topics we're missing) ──
        content_gap_kws: list[str] = []
        if brief.competitors_urls:
            _update_task(task, 49, {"stage": "content_gap", "stage_label": "Контентные пробелы → ключи"}, db)
            try:
                # Build client pages list from crawl data
                client_pages_for_gap: list[dict] = []
                if site_ctx:
                    from app.models.crawl import CrawlSession, CrawlStatus, Page
                    cr = db.scalar(select(CrawlSession).where(
                        CrawlSession.project_id == uuid.UUID(project_id),
                        CrawlSession.status == CrawlStatus.DONE,
                    ).order_by(CrawlSession.finished_at.desc()))
                    if cr:
                        cpages = db.scalars(select(Page).where(
                            Page.crawl_session_id == cr.id,
                            Page.status_code == 200,
                        ).limit(50)).all()
                        client_pages_for_gap = [{"url": p.url, "title": p.title, "h1": p.h1} for p in cpages]
                content_gap_kws = _run_async(
                    _extract_content_gap_keywords(
                        brief.competitors_urls, client_pages_for_gap,
                        brief.niche or brief.products, db,
                    )
                )
                logger.info("Autopilot: %d keywords from content gap analysis", len(content_gap_kws))
            except LLMBillingError:
                raise
            except Exception as exc:
                logger.warning("Autopilot content gap: %s", exc)

        # ── Merge all sources and deduplicate ─────────────────────────────
        seen: set[str] = set(sel)  # masks already saved separately
        uniq: list[str] = []
        # Include all keyword sources
        all_sources = ws_suggestions + serp_suggestions + matrix_phrases + ai_phrases + competitor_keywords + content_gap_kws
        for p in all_sources:
            norm = p.strip().lower()
            if norm and norm not in seen and len(norm) < 200:
                seen.add(norm)
                uniq.append(norm)
        logger.info(
            "Autopilot: %d unique keywords after merge (ws=%d, serp=%d, matrix=%d, ai=%d, competitors=%d, content_gap=%d)",
            len(uniq), len(ws_suggestions), len(serp_suggestions), len(matrix_phrases),
            len(ai_phrases), len(competitor_keywords), len(content_gap_kws),
        )

        # Morphological deduplication — remove 'купить диваны' if 'купить диван' exists
        before_dedup = len(uniq)
        uniq = _deduplicate_morphological(uniq)
        if before_dedup != len(uniq):
            logger.info("Autopilot: morphological dedup removed %d duplicates (%d → %d)",
                        before_dedup - len(uniq), before_dedup, len(uniq))

        if not uniq:
            raise RuntimeError("Не удалось собрать ключевые слова. Проверьте API-ключи.")

        # Cap total keywords to prevent memory/DB explosion
        if len(uniq) > _MAX_KEYWORDS_TOTAL:
            logger.warning(
                "Autopilot: capping keywords from %d to %d (sorted by frequency priority)",
                len(uniq), _MAX_KEYWORDS_TOTAL,
            )
            uniq = uniq[:_MAX_KEYWORDS_TOTAL]

        _update_task(task, 50, {"stage": "wordstat_kw", "stage_label": "Частотность ключей", "keywords": len(uniq)}, db)

        # ── Phase 6: Wordstat for all keywords (50-75%) ──────────────────
        kw_freq: dict[str, dict] = {}
        if wordstat and uniq:
            from datetime import timedelta

            from app.routers.marketing import CACHE_TTL_DAYS
            cutoff = datetime.now(tz=timezone.utc) - timedelta(days=CACHE_TTL_DAYS)
            cached = {r.phrase: r for r in db.scalars(select(KeywordCache).where(KeywordCache.phrase.in_(uniq), KeywordCache.region_id == sp.region_id, KeywordCache.cached_at > cutoff)).all()}
            uncached = [p for p in uniq if p not in cached]
            if uncached:
                for i in range(0, len(uncached), 250):
                    batch = uncached[i:i + 250]
                    try:
                        fresh = _ws_call_with_retry(wordstat.get_all_frequencies, batch, regions=regions)
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
                        task.progress = min(75, int(50 + (i + 250) / max(len(uncached), 1) * 25))
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
        # Precompute source sets for fast lookup
        _ws_set = {s.strip().lower() for s in ws_suggestions}
        _serp_set = {s.strip().lower() for s in serp_suggestions}
        _matrix_set = {m.strip().lower() for m in matrix_phrases}
        _comp_set = {c.strip().lower() for c in competitor_keywords}
        _gap_set = {g.strip().lower() for g in content_gap_kws}
        for ph in uniq:
            f = kw_freq.get(ph, {"base": 0, "phrase_freq": 0, "exact": 0, "order": 0})
            ex = f.get("exact", 0) or 0
            if wordstat and min_freq_exact > 0 and ex < min_freq_exact:
                continue
            if ph in _ws_set:
                source = "wordstat"
            elif ph in _serp_set:
                source = "serp"
            elif ph in _matrix_set:
                source = "matrix"
            elif ph in _comp_set:
                source = "competitor"
            elif ph in _gap_set:
                source = "content_gap"
            else:
                source = "claude"
            db.add(SemanticKeyword(semantic_project_id=sem_id, phrase=ph, frequency_base=f.get("base"), frequency_phrase=f.get("phrase_freq"), frequency_exact=f.get("exact"), frequency_order=f.get("order"), kw_type=_kw_type_classify(ex), source=source, is_mask=False, mask_selected=False))
            saved += 1
        sp.pipeline_step = max(sp.pipeline_step, 2)
        db.commit()
        _update_task(task, 75, {"stage": "clean", "stage_label": "Авто-очистка", "saved": saved}, db)

        # ── Phase 7: Auto-clean (75-85%) ──────────────────────────────────
        # Pre-seed niche negative keywords
        if niche_tmpl and niche_tmpl.get("negative_keywords_base"):
            existing_mw = {mw.word.lower() for mw in db.scalars(select(MarketingMinusWord).where(MarketingMinusWord.semantic_project_id == sem_id)).all()}
            now_neg = datetime.now(timezone.utc)
            for neg in niche_tmpl["negative_keywords_base"]:
                if neg.lower() not in existing_mw:
                    db.add(MarketingMinusWord(semantic_project_id=sem_id, word=neg.lower(), note="авто (шаблон ниши)", added_at=now_neg))
            db.commit()
            logger.info("Autopilot: seeded %d niche negative keywords", len(niche_tmpl["negative_keywords_base"]))

        mw_list = [mw.word.lower() for mw in db.scalars(select(MarketingMinusWord).where(MarketingMinusWord.semantic_project_id == sem_id)).all()]
        act = db.scalars(select(SemanticKeyword).where(SemanticKeyword.semantic_project_id == sem_id, SemanticKeyword.is_mask.is_(False), SemanticKeyword.is_excluded.is_(False))).all()
        excl = 0
        excl_reasons = {"zero": 0, "long": 0, "minus": 0, "branded": 0, "irrelevant": 0, "morph_dup": 0}
        now_ts2 = datetime.now(timezone.utc)

        # Step 1: Rule-based exclusions (zero freq, long tail, minus words)
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
                excl_reasons[r] = excl_reasons.get(r, 0) + 1

        db.flush()
        _update_task(task, 77, {"stage": "clean_rules", "stage_label": "Правила очистки применены", "excluded_rules": excl}, db)

        # Step 2: Morphological dedup among remaining active keywords
        remaining = db.scalars(select(SemanticKeyword).where(
            SemanticKeyword.semantic_project_id == sem_id,
            SemanticKeyword.is_mask.is_(False),
            SemanticKeyword.is_excluded.is_(False),
        ).order_by(SemanticKeyword.frequency_exact.desc().nullslast())).all()

        seen_norms: set[str] = set()
        morph_dup_count = 0
        for kw in remaining:
            norm = _normalize_phrase(kw.phrase)
            if norm in seen_norms:
                kw.is_excluded = True
                kw.excluded_at = now_ts2
                morph_dup_count += 1
            else:
                seen_norms.add(norm)
        excl += morph_dup_count
        excl_reasons["morph_dup"] = morph_dup_count
        db.flush()
        logger.info("Autopilot clean: morphological dedup excluded %d", morph_dup_count)

        # Step 3: Claude-based relevance filtering for borderline keywords
        # Send a sample of remaining keywords to Claude to detect irrelevant ones
        still_active = db.scalars(select(SemanticKeyword).where(
            SemanticKeyword.semantic_project_id == sem_id,
            SemanticKeyword.is_mask.is_(False),
            SemanticKeyword.is_excluded.is_(False),
        )).all()
        if still_active and (brief.niche or brief.products):
            # Take up to 500 keywords for Claude review (sorted by lowest frequency)
            candidates = sorted(still_active, key=lambda k: k.frequency_exact or 0)[:500]
            candidate_phrases = [k.phrase for k in candidates]
            niche_desc = brief.niche or brief.products or ""
            clean_prompt = (
                f"Проанализируй ключевые слова для бизнеса: «{niche_desc}».\n"
                f"Продукты/услуги: {brief.products or 'не указаны'}\n"
                f"Целевая аудитория: {brief.target_audience or 'не указана'}\n\n"
                f"Ключевые слова ({len(candidate_phrases)} шт.):\n"
                f"{json.dumps(candidate_phrases, ensure_ascii=False)}\n\n"
                f"Найди НЕРЕЛЕВАНТНЫЕ запросы, которые НЕ относятся к этому бизнесу.\n"
                f"Признаки нерелевантности:\n"
                f"- Запрос про другую тематику/нишу\n"
                f"- Информационный запрос, не связанный с продуктом (если режим Директ)\n"
                f"- Запрос про конкурентов (бренды конкурентов)\n"
                f"- Слишком общий запрос без коммерческого интента\n\n"
                f"Верни ТОЛЬКО JSON-массив нерелевантных фраз. Если все релевантны — верни []."
            )
            try:
                claude_clean = get_claude_client(db, task_type="semantic_clean")
                clean_system = "Ты — SEO-специалист. Отвечай строго JSON-массивом строк. Никакого другого текста."
                raw_clean = _run_async(claude_clean.generate(clean_system, clean_prompt))
                irrelevant_phrases = set(_parse_json_array(raw_clean))
                if irrelevant_phrases:
                    phrase_to_kw_map = {k.phrase: k for k in candidates}
                    for phrase in irrelevant_phrases:
                        if phrase in phrase_to_kw_map:
                            kw_obj = phrase_to_kw_map[phrase]
                            if not kw_obj.is_excluded:
                                kw_obj.is_excluded = True
                                kw_obj.excluded_at = now_ts2
                                excl += 1
                                excl_reasons["irrelevant"] = excl_reasons.get("irrelevant", 0) + 1
                    logger.info("Autopilot clean: Claude flagged %d irrelevant keywords", len(irrelevant_phrases))
            except LLMBillingError:
                raise
            except Exception as exc:
                logger.warning("Autopilot Claude clean: %s", exc)

        sp.pipeline_step = max(sp.pipeline_step, 3)
        db.commit()
        kept = saved - excl
        _update_task(task, 85, {
            "stage": "cluster", "stage_label": "Кластеризация",
            "saved": saved, "excluded": excl, "kept": kept,
            "excluded_details": excl_reasons,
        }, db)

        # ── Phase 8: Cluster (85-95%) ─────────────────────────────────────
        # Strategy: Topvisor SERP-overlap clustering (primary) → Claude (fallback)
        ckws = db.scalars(select(SemanticKeyword).where(SemanticKeyword.semantic_project_id == sem_id, SemanticKeyword.is_mask.is_(False), SemanticKeyword.is_excluded.is_(False)).order_by(SemanticKeyword.frequency_exact.desc().nullslast())).all()
        c_phrases = [k.phrase for k in ckws]  # no cap — process all via multi-batch

        # Try Topvisor SERP-based clustering first (gold standard)
        from app.models.project import Project
        project_obj = db.get(Project, uuid.UUID(project_id))
        tv_key = None
        tv_user_id = ""
        tv_project_id = None
        topvisor_groups = None

        if project_obj and project_obj.topvisor_project_id:
            from app.services.topvisor import get_topvisor_client_key, get_topvisor_user_id
            tv_key = get_topvisor_client_key(db)
            tv_user_id = get_topvisor_user_id(db) or ""
            tv_project_id = project_obj.topvisor_project_id

        if tv_key and tv_project_id and c_phrases:
            _update_task(task, 86, {"stage": "cluster_topvisor", "stage_label": "Кластеризация через Topvisor (SERP-overlap)"}, db)
            logger.info("Autopilot: attempting Topvisor SERP-based clustering (%d phrases)", len(c_phrases))
            try:
                topvisor_groups = _run_async(
                    _cluster_via_topvisor(c_phrases, tv_project_id, tv_key, tv_user_id, timeout_seconds=300)
                )
                if topvisor_groups:
                    logger.info("Autopilot: Topvisor returned %d cluster groups", len(topvisor_groups))
            except Exception as exc:
                logger.warning("Autopilot Topvisor cluster failed: %s, falling back to Claude", exc)

        # Build cluster assignments into an intermediate dict FIRST,
        # then apply atomically — so a mid-clustering failure doesn't orphan keywords.
        # Structure: {cluster_name: {intent, priority, campaign_type, suggested_title, keywords: [phrase]}}
        p2kw = {k.phrase: k for k in ckws}
        p_set = set(c_phrases)
        n_cl = 0
        pending_clusters: list[dict] = []  # [{name, intent, priority, ..., keywords: [str]}]
        assigned: set[str] = set()

        if topvisor_groups:
            # ── Build Topvisor cluster assignments ──────────────────────────
            _update_task(task, 90, {"stage": "cluster_apply", "stage_label": "Применяем кластеры Topvisor"}, db)
            for group in topvisor_groups:
                group_kws = [kw for kw in (group.get("keywords") or []) if kw in p_set]
                if not group_kws:
                    continue
                cluster_name = f"Кластер {group.get('group_id', n_cl + 1)}"
                pending_clusters.append({
                    "name": cluster_name[:255], "intent": None, "priority": None,
                    "campaign_type": None, "suggested_title": None,
                    "keywords": group_kws,
                })
                assigned.update(group_kws)
                n_cl += 1

            # Enrich Topvisor clusters with Claude (names, intents) — best-effort
            _update_task(task, 92, {"stage": "cluster_enrich", "stage_label": "ИИ обогащает кластеры (названия, интенты)"}, db)
            try:
                import re
                claude_c = get_claude_client(db, task_type="semantic_cluster")
                for cl_data in pending_clusters:
                    sample_kws = cl_data["keywords"][:20]
                    if not sample_kws:
                        continue
                    enrich_prompt = (
                        f"Вот ключевые слова одного кластера:\n{json.dumps(sample_kws, ensure_ascii=False)}\n\n"
                        f"Придумай:\n1. Краткое название кластера (2-5 слов)\n"
                        f"2. Интент: коммерческий | информационный | навигационный | общий\n"
                        f"3. Приоритет: высокий | средний | низкий\n\n"
                        f'Верни JSON: {{"name": "...", "intent": "...", "priority": "..."}}'
                    )
                    try:
                        raw_enrich = _run_async(claude_c.generate(
                            "Ты — SEO-специалист. Отвечай строго JSON. Никакого другого текста.",
                            enrich_prompt,
                        ))
                        m = re.search(r'\{.*?\}', raw_enrich, re.DOTALL)
                        if m:
                            enrichment = json.loads(m.group())
                            new_name = str(enrichment.get("name", "")).strip()
                            if new_name:
                                cl_data["name"] = new_name[:255]
                                cl_data["intent"] = (enrichment.get("intent") or "")[:50] or None
                                cl_data["priority"] = (enrichment.get("priority") or "")[:20] or None
                    except Exception:
                        pass  # enrichment is best-effort
            except LLMBillingError:
                raise
            except Exception as exc:
                logger.warning("Autopilot cluster enrichment: %s", exc)

            logger.info("Autopilot: Topvisor clustering done — %d clusters", n_cl)
        else:
            # ── Fallback: Claude-based clustering ───────────────────────────
            _update_task(task, 87, {"stage": "cluster_claude", "stage_label": "Кластеризация через ИИ (Topvisor недоступен)"}, db)
            logger.info("Autopilot: using Claude clustering (Topvisor unavailable)")
            claude_c = get_claude_client(db, task_type="semantic_cluster")
            sys_c = get_prompt("semantic_cluster", db) or _CLUSTER_SYSTEM
            all_cl: list[dict] = []
            for i in range(0, len(c_phrases), 300):
                b = c_phrases[i:i + 300]
                try:
                    all_cl.extend(_parse_cluster_json(_run_async(claude_c.generate(sys_c, _build_cluster_prompt(phrases=b, mode=sp.mode.value, target_clusters=max(3, len(b) // 12), region=sp.region)))))
                except LLMBillingError:
                    raise
                except Exception as exc:
                    logger.warning("Autopilot cluster: %s", exc)
                if task:
                    task.progress = min(95, int(85 + (i + len(b)) / max(len(c_phrases), 1) * 10))
                    db.commit()

            for cd in all_cl:
                nm = str(cd.get("name", "")).strip()
                if not nm:
                    continue
                kps = [p for p in (cd.get("keywords") or []) if isinstance(p, str) and p in p_set]
                if not kps:
                    continue
                pending_clusters.append({
                    "name": nm[:255],
                    "intent": (cd.get("intent") or "")[:50] or None,
                    "priority": (cd.get("priority") or "")[:20] or None,
                    "campaign_type": (cd.get("campaign_type") or "")[:50] or None,
                    "suggested_title": (cd.get("suggested_title") or "")[:255] or None,
                    "keywords": kps,
                })
                assigned.update(kps)
                n_cl += 1

        # ── Atomic apply: delete old → write new clusters + assignments ───
        # Only now do we touch DB — if we got here, clustering succeeded.
        for oc in db.scalars(select(SemanticCluster).where(SemanticCluster.semantic_project_id == sem_id)).all():
            db.delete(oc)
        db.flush()
        for kw in db.scalars(select(SemanticKeyword).where(SemanticKeyword.semantic_project_id == sem_id)).all():
            kw.cluster_name = None

        for cl_data in pending_clusters:
            db.add(SemanticCluster(
                semantic_project_id=sem_id, name=cl_data["name"],
                intent=cl_data.get("intent"), priority=cl_data.get("priority"),
                campaign_type=cl_data.get("campaign_type"),
                suggested_title=cl_data.get("suggested_title"),
            ))
            for p in cl_data["keywords"]:
                if p in p2kw:
                    p2kw[p].cluster_name = cl_data["name"]

        # Unclustered → "Прочее"
        unc = p_set - assigned
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
                "sources": {
                    "wordstat_suggestions": len(ws_suggestions),
                    "serp_autocomplete": len(serp_suggestions),
                    "modifier_matrix": len(matrix_phrases),
                    "ai_expand": len(ai_phrases),
                    "competitor_meta": len(competitor_keywords),
                    "content_gap": len(content_gap_kws),
                },
                "cluster_method": "topvisor" if topvisor_groups else "claude",
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

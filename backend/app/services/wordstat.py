"""Yandex Wordstat API client (Yandex Cloud Search API v2).

REST API: https://searchapi.api.cloud.yandex.net/v2/wordstat/
Методы:
  - GetTop (topRequests) — топ запросов за 30 дней
  - GetDynamics (dynamics) — динамика частоты по месяцам/неделям/дням
  - GetRegionsDistribution (regions) — распределение по регионам
  - GetRegionsTree (getRegionsTree) — дерево регионов

Авторизация: API-ключ или IAM-токен Yandex Cloud.
Требуется: folderId (ID каталога Yandex Cloud).
Роль: search-api.webSearch.user.

Лимиты: 10 запросов/сек, 1000 запросов/сутки (по умолчанию).
"""
import asyncio
import logging
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://searchapi.api.cloud.yandex.net/v2/wordstat"
MAX_CONCURRENT_REQUESTS = 5  # параллельных запросов к API


class WordstatError(Exception):
    """Ошибка Yandex Wordstat API."""

    def __init__(self, code: int, message: str, detail: str = ""):
        self.code = code
        self.message = message
        self.detail = detail
        super().__init__(f"Wordstat error {code}: {message} ({detail})")


class WordstatClient:

    def __init__(self, api_key: str, folder_id: str):
        self.api_key = api_key
        self.folder_id = folder_id

    def _auth_headers(self) -> dict[str, str]:
        """Заголовки авторизации. Поддерживает API-ключ и IAM-токен."""
        if self.api_key.startswith("t1."):
            # IAM-токен (начинается с t1.)
            return {"Authorization": f"Bearer {self.api_key}"}
        # API-ключ сервисного аккаунта
        return {"Authorization": f"Api-Key {self.api_key}"}

    async def _post(self, client: httpx.AsyncClient, endpoint: str, body: dict) -> dict:
        """POST-запрос к Wordstat API."""
        body["folderId"] = self.folder_id
        resp = await client.post(
            f"{BASE_URL}/{endpoint}",
            json=body,
            headers=self._auth_headers(),
        )
        if resp.status_code == 429:
            raise WordstatError(429, "Quota limit exceeded", resp.text)
        if resp.status_code == 503:
            raise WordstatError(503, "Service unavailable", resp.text)
        if resp.status_code >= 400:
            raise WordstatError(resp.status_code, f"HTTP {resp.status_code}", resp.text)
        return resp.json()

    # ── GetTop ─────────────────────────────────────────────────────

    async def _get_top(
        self,
        client: httpx.AsyncClient,
        phrase: str,
        regions: list[int] | None = None,
        num_phrases: int = 1,
    ) -> dict:
        """GetTop — топ запросов, содержащих указанную фразу (за 30 дней).

        Возвращает:
          totalCount — общее кол-во запросов (= base frequency)
          results — список {phrase, count}
          associations — похожие запросы
        """
        body: dict = {"phrase": phrase, "numPhrases": str(num_phrases)}
        if regions:
            body["regions"] = [str(r) for r in regions]
        return await self._post(client, "topRequests", body)

    # ── GetDynamics ────────────────────────────────────────────────

    async def _get_dynamics(
        self,
        client: httpx.AsyncClient,
        phrase: str,
        period: str = "PERIOD_MONTHLY",
        from_date: str | None = None,
        to_date: str | None = None,
        regions: list[int] | None = None,
    ) -> dict:
        """GetDynamics — динамика частоты запроса по периодам."""
        body: dict = {"phrase": phrase, "period": period}
        if from_date:
            body["fromDate"] = from_date
        if to_date:
            body["toDate"] = to_date
        if regions:
            body["regions"] = [str(r) for r in regions]
        return await self._post(client, "dynamics", body)

    # ── публичные методы ──────────────────────────────────────────

    async def get_frequencies(
        self, phrases: list[str], regions: list[int] | None = None
    ) -> dict[str, int]:
        """Возвращает {phrase: base_frequency} для каждой фразы.

        base_frequency = totalCount из GetTop (широкая частота за 30 дней).
        """
        if not phrases:
            return {}

        results: dict[str, int] = {}
        errors: list[Exception] = []
        sem = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

        async def _fetch_one(client: httpx.AsyncClient, phrase: str) -> None:
            async with sem:
                try:
                    data = await self._get_top(client, phrase, regions, num_phrases=1)
                    results[phrase] = int(data.get("totalCount", 0))
                except Exception as exc:
                    errors.append(exc)
                    logger.warning("Wordstat get_frequencies error for '%s': %s", phrase, exc)

        async with httpx.AsyncClient(timeout=60) as client:
            await asyncio.gather(*[_fetch_one(client, p) for p in phrases])

        if errors and len(errors) >= len(phrases):
            raise WordstatError(
                0,
                f"All {len(errors)} Wordstat requests failed",
                str(errors[0]),
            )
        return results

    async def get_all_frequencies(
        self, phrases: list[str], regions: list[int] | None = None
    ) -> dict[str, dict]:
        """Получает все 4 типа частот Wordstat для каждой фразы.

        GetTop поддерживает поисковые операторы:
          - base:   купить диван          (все формы, + доп. слова)
          - phrase: "купить диван"        (все формы, без доп. слов)
          - exact:  "!купить !диван"      (точные формы, без доп. слов)
          - order:  [купить диван]        (точный порядок слов)

        Для каждой фразы делаем 4 запроса GetTop с разными операторами.
        Возвращает {phrase: {base, phrase_freq, exact, order}}
        """
        if not phrases:
            return {}

        results: dict[str, dict] = {}
        errors: list[Exception] = []
        sem = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

        async def _fetch_variant(
            client: httpx.AsyncClient, phrase: str, variant_phrase: str, freq_type: str
        ) -> tuple[str, str, int]:
            """Запрашивает totalCount для одного варианта фразы."""
            async with sem:
                data = await self._get_top(client, variant_phrase, regions, num_phrases=1)
                return phrase, freq_type, int(data.get("totalCount", 0))

        async def _fetch_all_for_phrase(
            client: httpx.AsyncClient, phrase: str
        ) -> None:
            words = phrase.strip()
            exact_words = " ".join(f"!{w}" for w in words.split())
            variants = [
                (words, "base"),
                (f'"{words}"', "phrase_freq"),
                (f'"{exact_words}"', "exact"),
                (f"[{words}]", "order"),
            ]
            try:
                tasks = [
                    _fetch_variant(client, phrase, v, t) for v, t in variants
                ]
                variant_results = await asyncio.gather(*tasks)
                freq_map = {t: count for _, t, count in variant_results}
                results[phrase] = {
                    "base": freq_map.get("base", 0),
                    "phrase_freq": freq_map.get("phrase_freq", 0),
                    "exact": freq_map.get("exact", 0),
                    "order": freq_map.get("order", 0),
                }
            except Exception as exc:
                errors.append(exc)
                logger.warning(
                    "Wordstat get_all_frequencies error for '%s': %s", phrase, exc
                )

        async with httpx.AsyncClient(timeout=60) as client:
            await asyncio.gather(*[_fetch_all_for_phrase(client, p) for p in phrases])

        if errors and len(errors) >= len(phrases):
            raise WordstatError(
                0,
                f"All {len(errors)} Wordstat requests failed",
                str(errors[0]),
            )
        return results

    async def get_suggestions(
        self,
        phrase: str,
        regions: list[int] | None = None,
        num_phrases: int = 200,
    ) -> dict:
        """Возвращает вложенные запросы (results) и похожие (associations) из GetTop.

        Это аналог того, что показывает Wordstat в веб-интерфейсе:
        - results: «Запросы со словами» (вкладка "Популярные")
        - associations: «Похожие запросы» (вкладка "Похожие")

        Каждый элемент: {phrase: str, count: int}
        """
        nested: list[dict] = []
        similar: list[dict] = []
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                data = await self._get_top(client, phrase, regions, num_phrases=num_phrases)
            for item in data.get("results", []):
                p = item.get("phrase", "").strip().lower()
                c = int(item.get("count", 0))
                if p and p != phrase.strip().lower():
                    nested.append({"phrase": p, "count": c})
            for item in data.get("associations", []):
                p = item.get("phrase", "").strip().lower()
                c = int(item.get("count", 0))
                if p:
                    similar.append({"phrase": p, "count": c})
        except Exception as exc:
            logger.warning("Wordstat get_suggestions error for '%s': %s", phrase, exc)
        return {"nested": nested, "similar": similar}

    async def get_dynamics(
        self, phrase: str, regions: list[int] | None = None
    ) -> list[dict]:
        """Возвращает помесячную динамику частоты фразы за последний год."""
        if not phrase:
            return []
        try:
            now = datetime.now(tz=timezone.utc)
            from_date = now.replace(year=now.year - 1).strftime("%Y-%m-%dT00:00:00Z")
            to_date = now.strftime("%Y-%m-%dT23:59:59Z")

            async with httpx.AsyncClient(timeout=60) as client:
                data = await self._get_dynamics(
                    client,
                    phrase,
                    period="PERIOD_MONTHLY",
                    from_date=from_date,
                    to_date=to_date,
                    regions=regions,
                )
            result = []
            for item in data.get("results", []):
                date_str = item.get("date", "")
                count = int(item.get("count", 0))
                if date_str and count:
                    # date_str в RFC3339: "2025-01-01T00:00:00Z"
                    year_month = date_str[:7]  # "2025-01"
                    result.append({"year_month": year_month, "count": count})
            return result
        except Exception as exc:
            logger.warning("Wordstat get_dynamics error: %s", exc)
            return []


def get_wordstat_client(db) -> WordstatClient | None:
    """Создаёт WordstatClient из настроек в БД.

    Требуются два ключа:
      - wordstat_api_key: API-ключ или IAM-токен Yandex Cloud
      - wordstat_folder_id: ID каталога Yandex Cloud
    Для обратной совместимости также проверяет wordstat_oauth_token.
    """
    from app.services.settings_service import get_setting

    api_key = get_setting("wordstat_api_key", db) or get_setting("wordstat_oauth_token", db)
    if not api_key:
        return None
    folder_id = get_setting("wordstat_folder_id", db)
    if not folder_id:
        return None
    return WordstatClient(api_key, folder_id)

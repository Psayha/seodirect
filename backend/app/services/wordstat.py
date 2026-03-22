"""Яндекс Wordstat API client (через Yandex Direct API v4).

Wordstat API — часть Yandex Direct API v4.
URL: https://api.direct.yandex.ru/v4/json/
Методы: CreateNewWordstatReport, GetWordstatReportList,
         GetWordstatReport, DeleteWordstatReport.

API асинхронный: создаём отчёт → поллим статус → забираем → удаляем.
Лимиты: макс. 10 фраз/отчёт, макс. 5 отчётов одновременно.
"""
import asyncio
import logging

import httpx

logger = logging.getLogger(__name__)

MAX_PHRASES_PER_REPORT = 10
MAX_CONCURRENT_REPORTS = 5
POLL_INTERVAL_SEC = 15
MAX_POLL_ATTEMPTS = 40  # ~10 мин макс. ожидание


class WordstatError(Exception):
    """Ошибка Yandex Wordstat API."""

    def __init__(self, code: int, message: str, detail: str = ""):
        self.code = code
        self.message = message
        self.detail = detail
        super().__init__(f"Wordstat error {code}: {message} ({detail})")


class WordstatClient:
    BASE_URL = "https://api.direct.yandex.ru/v4/json/"

    def __init__(self, oauth_token: str):
        self.token = oauth_token

    async def _api_call(self, client: httpx.AsyncClient, method: str, param=None) -> dict:
        """Вызов Yandex Direct API v4."""
        body: dict = {
            "method": method,
            "token": self.token,
            "locale": "ru",
        }
        if param is not None:
            body["param"] = param

        resp = await client.post(
            self.BASE_URL,
            json=body,
            headers={"Content-Type": "application/json; charset=utf-8"},
        )
        resp.raise_for_status()
        data = resp.json()

        if "error_code" in data:
            raise WordstatError(
                code=data["error_code"],
                message=data.get("error_str", ""),
                detail=data.get("error_detail", ""),
            )
        return data

    # ── внутренние методы для отчётов ──────────────────────────────

    async def _create_report(
        self, client: httpx.AsyncClient, phrases: list[str], geo: list[int] | None = None
    ) -> int:
        """CreateNewWordstatReport → возвращает report_id."""
        param: dict = {"Phrases": phrases}
        if geo:
            param["GeoID"] = geo
        data = await self._api_call(client, "CreateNewWordstatReport", param)
        return int(data["data"])

    async def _wait_report(self, client: httpx.AsyncClient, report_id: int) -> None:
        """Поллинг GetWordstatReportList пока статус != Done."""
        for attempt in range(MAX_POLL_ATTEMPTS):
            data = await self._api_call(client, "GetWordstatReportList")
            for report in data.get("data", []):
                if report["ReportID"] == report_id:
                    if report["StatusReport"] == "Done":
                        return
                    break
            else:
                # Отчёт исчез из списка — ошибка
                raise WordstatError(0, "Report disappeared", str(report_id))
            await asyncio.sleep(POLL_INTERVAL_SEC)
        raise TimeoutError(f"Wordstat report {report_id} не завершился за {MAX_POLL_ATTEMPTS * POLL_INTERVAL_SEC}с")

    async def _fetch_report(self, client: httpx.AsyncClient, report_id: int) -> list[dict]:
        """GetWordstatReport → данные отчёта."""
        data = await self._api_call(client, "GetWordstatReport", report_id)
        return data.get("data", [])

    async def _delete_report(self, client: httpx.AsyncClient, report_id: int) -> None:
        """DeleteWordstatReport — освобождаем слот."""
        try:
            await self._api_call(client, "DeleteWordstatReport", report_id)
        except Exception:
            pass

    async def _run_report(
        self, client: httpx.AsyncClient, phrases: list[str], geo: list[int] | None = None
    ) -> list[dict]:
        """Полный цикл: create → wait → fetch → delete."""
        report_id = await self._create_report(client, phrases, geo)
        try:
            await self._wait_report(client, report_id)
            return await self._fetch_report(client, report_id)
        finally:
            await self._delete_report(client, report_id)

    def _extract_shows(self, item: dict) -> int:
        """Извлекает Shows из первого элемента SearchedWith."""
        searched = item.get("SearchedWith", [])
        if searched:
            return searched[0].get("Shows", 0)
        return 0

    # ── публичные методы ──────────────────────────────────────────

    async def get_frequencies(
        self, phrases: list[str], regions: list[int] | None = None
    ) -> dict[str, int]:
        """Возвращает {phrase: base_frequency} для каждой фразы.

        base_frequency — «широкая» частота (все формы слов, любые доп. слова).
        Это SearchedWith[0].Shows из ответа Wordstat.
        """
        if not phrases:
            return {}

        results: dict[str, int] = {}
        async with httpx.AsyncClient(timeout=120) as client:
            # Обрабатываем батчами по MAX_PHRASES_PER_REPORT
            sem = asyncio.Semaphore(MAX_CONCURRENT_REPORTS)

            async def _process_batch(batch: list[str]) -> None:
                async with sem:
                    try:
                        report_data = await self._run_report(client, batch, regions)
                        for item in report_data:
                            phrase_key = item.get("Phrase", "")
                            if phrase_key:
                                results[phrase_key] = self._extract_shows(item)
                    except Exception as exc:
                        logger.warning("Wordstat get_frequencies batch error: %s", exc)

            tasks = []
            for i in range(0, len(phrases), MAX_PHRASES_PER_REPORT):
                batch = phrases[i : i + MAX_PHRASES_PER_REPORT]
                tasks.append(_process_batch(batch))
            await asyncio.gather(*tasks)

        return results

    async def get_all_frequencies(
        self, phrases: list[str], regions: list[int] | None = None
    ) -> dict[str, dict]:
        """Получает все 4 типа частот Wordstat для каждой фразы.

        Операторы Wordstat:
          - base:   купить диван        (все формы, + доп. слова)
          - phrase: "купить диван"      (все формы, без доп. слов)
          - exact:  "!купить !диван"    (точные формы, без доп. слов)
          - order:  [купить диван]      (точный порядок слов)

        Возвращает {phrase: {base, phrase_freq, exact, order}}
        """
        if not phrases:
            return {}

        # Строим маппинг вариант → (оригинал, тип)
        variants: dict[str, tuple[str, str]] = {}
        all_variant_phrases: list[str] = []
        for phrase in phrases:
            words = phrase.strip()
            exact_words = " ".join(f"!{w}" for w in words.split())
            base_v = words
            phrase_v = f'"{words}"'
            exact_v = f'"{exact_words}"'
            order_v = f"[{words}]"
            for v, t in [
                (base_v, "base"),
                (phrase_v, "phrase"),
                (exact_v, "exact"),
                (order_v, "order"),
            ]:
                variants[v] = (phrase, t)
                all_variant_phrases.append(v)

        # Собираем частоты (макс. 10 фраз/отчёт, макс. 5 параллельно)
        raw: dict[str, int] = {}
        async with httpx.AsyncClient(timeout=120) as client:
            sem = asyncio.Semaphore(MAX_CONCURRENT_REPORTS)

            async def _process_batch(batch: list[str]) -> None:
                async with sem:
                    try:
                        report_data = await self._run_report(client, batch, regions)
                        for item in report_data:
                            vphrase = item.get("Phrase", "")
                            if vphrase:
                                raw[vphrase] = self._extract_shows(item)
                    except Exception as exc:
                        logger.warning("Wordstat get_all_frequencies batch error: %s", exc)

            tasks = []
            for i in range(0, len(all_variant_phrases), MAX_PHRASES_PER_REPORT):
                batch = all_variant_phrases[i : i + MAX_PHRASES_PER_REPORT]
                tasks.append(_process_batch(batch))
            await asyncio.gather(*tasks)

        # Маппим обратно на оригинальные фразы
        results: dict[str, dict] = {}
        for phrase in phrases:
            words = phrase.strip()
            exact_words = " ".join(f"!{w}" for w in words.split())
            results[phrase] = {
                "base": raw.get(words, 0),
                "phrase_freq": raw.get(f'"{words}"', 0),
                "exact": raw.get(f'"{exact_words}"', 0),
                "order": raw.get(f"[{words}]", 0),
            }
        return results

    async def get_dynamics(
        self, phrase: str, regions: list[int] | None = None
    ) -> list[dict]:
        """Возвращает текущую частоту фразы.

        Yandex Direct API v4 Wordstat не поддерживает помесячную динамику.
        Возвращает одну точку с текущей частотой.
        Для полной динамики нужна ручная агрегация или API Яндекс DataLens.
        """
        if not phrase:
            return []
        try:
            freqs = await self.get_frequencies([phrase], regions)
            shows = freqs.get(phrase, 0)
            if shows:
                from datetime import date

                return [{"year_month": date.today().strftime("%Y-%m"), "count": shows}]
            return []
        except Exception as exc:
            logger.warning("Wordstat get_dynamics error: %s", exc)
            return []

    async def get_user_info(self) -> dict:
        """Возвращает информацию о текущих отчётах (квоты)."""
        async with httpx.AsyncClient(timeout=15) as client:
            try:
                data = await self._api_call(client, "GetWordstatReportList")
                reports = data.get("data", [])
                return {
                    "pending_reports": len(
                        [r for r in reports if r.get("StatusReport") == "Pending"]
                    ),
                    "done_reports": len(
                        [r for r in reports if r.get("StatusReport") == "Done"]
                    ),
                    "total_reports": len(reports),
                    "max_concurrent": MAX_CONCURRENT_REPORTS,
                    "max_phrases_per_report": MAX_PHRASES_PER_REPORT,
                }
            except Exception as exc:
                logger.warning("Wordstat get_user_info error: %s", exc)
                return {}

    async def cleanup_reports(self) -> int:
        """Удаляет все завершённые отчёты. Возвращает кол-во удалённых."""
        deleted = 0
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                data = await self._api_call(client, "GetWordstatReportList")
                for report in data.get("data", []):
                    if report.get("StatusReport") == "Done":
                        await self._delete_report(client, report["ReportID"])
                        deleted += 1
            except Exception as exc:
                logger.warning("Wordstat cleanup error: %s", exc)
        return deleted


def get_wordstat_client(db) -> WordstatClient | None:
    from app.services.settings_service import get_setting

    token = get_setting("wordstat_oauth_token", db)
    if not token:
        return None
    return WordstatClient(token)

"""Яндекс Wordstat API client."""
from datetime import date, timedelta

import httpx


class WordstatClient:
    BASE_URL = "https://api.wordstat.yandex.net"

    def __init__(self, oauth_token: str):
        self.token = oauth_token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json;charset=utf-8"}

    async def get_dynamics(self, phrase: str, regions: list[int] | None = None) -> list[dict]:
        """Returns monthly frequency dynamics for a phrase over the past 13 months.
        Each item: {year_month: 'YYYY-MM', count: int}
        """
        today = date.today()
        # fromDate — первое число месяца ~13 месяцев назад
        from_month = (today.replace(day=1) - timedelta(days=13 * 30)).replace(day=1)
        # toDate — последнее число прошлого месяца
        to_month = today.replace(day=1) - timedelta(days=1)
        to_month = to_month.replace(day=1) + timedelta(days=32)
        to_month = to_month.replace(day=1) - timedelta(days=1)

        body: dict = {
            "phrase": phrase,
            "period": "monthly",
            "fromDate": from_month.strftime("%Y-%m-%d"),
            "toDate": to_month.strftime("%Y-%m-%d"),
        }
        if regions:
            body["regions"] = regions

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.post(
                    f"{self.BASE_URL}/v1/dynamics",
                    headers=self._headers(),
                    json=body,
                )
                if resp.status_code != 200:
                    return []
                data = resp.json()
                items = data.get("dynamics", [])
                return [
                    {"year_month": item.get("date", "")[:7], "count": item.get("count", 0)}
                    for item in items
                ]
            except Exception:
                return []

    async def get_frequencies(self, phrases: list[str], regions: list[int] | None = None) -> dict[str, int]:
        """Returns {phrase: monthly_frequency} for each phrase.
        Uses totalCount (all requests containing all words in any order).
        regions: list of Yandex region IDs (None = all regions)
        """
        if not phrases:
            return {}

        results: dict[str, int] = {}
        # Wordstat API: лимит 128 фраз за запрос
        batch_size = 128
        async with httpx.AsyncClient(timeout=30) as client:
            for i in range(0, len(phrases), batch_size):
                batch = phrases[i : i + batch_size]
                body: dict = {"phrases": batch}
                if regions:
                    body["regions"] = regions
                try:
                    resp = await client.post(
                        f"{self.BASE_URL}/v1/topRequests",
                        headers=self._headers(),
                        json=body,
                    )
                    if resp.status_code != 200:
                        continue
                    data = resp.json()
                    # При phrases[] ответ — массив объектов с requestPhrase и totalCount
                    for item in data if isinstance(data, list) else []:
                        phrase_key = item.get("requestPhrase", "")
                        if phrase_key and "error" not in item:
                            results[phrase_key] = item.get("totalCount", 0)
                except Exception:
                    continue
        return results

    async def get_user_info(self) -> dict:
        """Returns quota info: rps limit, daily limit, remaining daily quota."""
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.post(
                    f"{self.BASE_URL}/v1/userInfo",
                    headers=self._headers(),
                    json={},
                )
                if resp.status_code != 200:
                    return {}
                return resp.json()
            except Exception:
                return {}


def get_wordstat_client(db) -> WordstatClient | None:
    from app.settings.service import get_api_key
    token = get_api_key(db, "wordstat", "oauth_token")
    if not token:
        return None
    return WordstatClient(token)

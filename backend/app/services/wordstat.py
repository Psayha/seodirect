"""Яндекс Wordstat API client."""
from typing import Any

import httpx


class WordstatClient:
    BASE_URL = "https://api.wordstat.yandex.net"

    def __init__(self, oauth_token: str):
        self.token = oauth_token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    async def get_dynamics(self, phrase: str, regions: list[int] | None = None) -> list[dict]:
        """Returns monthly frequency dynamics for a phrase.
        Each item: {year_month: 'YYYY-MM', count: int}
        regions: list of Yandex region IDs (None = all regions)
        """
        body: dict = {"phrase": phrase}
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
                items = data.get("data", [])
                return [
                    {"year_month": item.get("date", "")[:7], "count": item.get("count", 0)}
                    for item in items
                ]
            except Exception:
                return []

    async def get_frequencies(self, phrases: list[str], regions: list[int] | None = None) -> dict[str, int]:
        """Returns {phrase: monthly_frequency} for each phrase.
        regions: list of Yandex region IDs (None = all regions)
        """
        if not phrases:
            return {}

        results: dict[str, int] = {}
        # Wordstat API имеет лимит ~100 фраз за запрос
        batch_size = 100
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
                    for item in data.get("data", []):
                        results[item["phrase"]] = item.get("count", 0)
                except Exception:
                    continue
        return results


def get_wordstat_client(db) -> WordstatClient | None:
    from app.settings.service import get_api_key
    token = get_api_key(db, "wordstat", "oauth_token")
    if not token:
        return None
    return WordstatClient(token)

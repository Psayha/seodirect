"""Яндекс Wordstat API client."""
import httpx
from typing import Any


class WordstatClient:
    BASE_URL = "https://api.wordstat.yandex.net"

    def __init__(self, oauth_token: str):
        self.token = oauth_token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    async def get_frequencies(self, phrases: list[str]) -> dict[str, int]:
        """Returns {phrase: monthly_frequency} for each phrase."""
        if not phrases:
            return {}

        results: dict[str, int] = {}
        # Wordstat API имеет лимит ~100 фраз за запрос
        batch_size = 100
        async with httpx.AsyncClient(timeout=30) as client:
            for i in range(0, len(phrases), batch_size):
                batch = phrases[i : i + batch_size]
                try:
                    resp = await client.post(
                        f"{self.BASE_URL}/v1/topRequests",
                        headers=self._headers(),
                        json={"phrases": batch, "geo_id": [0]},
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

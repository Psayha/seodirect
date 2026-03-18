"""Яндекс Метрика API client."""
from __future__ import annotations

from datetime import date, timedelta

import httpx

BASE = "https://api-metrika.yandex.net"


class MetrikaClient:
    def __init__(self, oauth_token: str):
        self.token = oauth_token
        self.headers = {"Authorization": f"OAuth {oauth_token}"}

    async def get_counters(self) -> list[dict]:
        """List of available Metrika counters."""
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{BASE}/management/v1/counters", headers=self.headers)
            r.raise_for_status()
            data = r.json()
            return [
                {
                    "id": c["id"],
                    "name": c.get("name", ""),
                    "site": c.get("site", ""),
                    "status": c.get("status", ""),
                }
                for c in data.get("counters", [])
            ]

    async def get_summary(
        self,
        counter_id: int,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> dict:
        """Main dashboard metrics for the counter."""
        if not date_from:
            date_from = (date.today() - timedelta(days=30)).isoformat()
        if not date_to:
            date_to = date.today().isoformat()

        params = {
            "ids": counter_id,
            "metrics": "ym:s:visits,ym:s:users,ym:s:bounceRate,ym:s:avgVisitDurationSeconds,ym:s:pageviews",
            "date1": date_from,
            "date2": date_to,
            "accuracy": "full",
        }
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(f"{BASE}/stat/v1/data", headers=self.headers, params=params)
            r.raise_for_status()
            data = r.json()

        totals = data.get("totals", [0, 0, 0, 0, 0])
        return {
            "visits": int(totals[0]) if len(totals) > 0 else 0,
            "users": int(totals[1]) if len(totals) > 1 else 0,
            "bounce_rate": round(float(totals[2]), 1) if len(totals) > 2 else 0,
            "avg_duration": int(totals[3]) if len(totals) > 3 else 0,
            "pageviews": int(totals[4]) if len(totals) > 4 else 0,
            "date_from": date_from,
            "date_to": date_to,
        }

    async def get_traffic_sources(
        self,
        counter_id: int,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[dict]:
        """Traffic by source (search, direct, referral, social, etc.)."""
        if not date_from:
            date_from = (date.today() - timedelta(days=30)).isoformat()
        if not date_to:
            date_to = date.today().isoformat()

        params = {
            "ids": counter_id,
            "metrics": "ym:s:visits,ym:s:users",
            "dimensions": "ym:s:trafficSourceName",
            "date1": date_from,
            "date2": date_to,
            "sort": "-ym:s:visits",
            "limit": 10,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(f"{BASE}/stat/v1/data", headers=self.headers, params=params)
            r.raise_for_status()
            data = r.json()

        result = []
        for row in data.get("data", []):
            dims = row.get("dimensions", [{}])
            name = dims[0].get("name", "Unknown") if dims else "Unknown"
            vals = row.get("metrics", [0, 0])
            result.append({
                "source": name,
                "visits": int(vals[0]) if vals else 0,
                "users": int(vals[1]) if len(vals) > 1 else 0,
            })
        return result

    async def get_daily_visits(
        self,
        counter_id: int,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[dict]:
        """Daily visits for chart."""
        if not date_from:
            date_from = (date.today() - timedelta(days=30)).isoformat()
        if not date_to:
            date_to = date.today().isoformat()

        params = {
            "ids": counter_id,
            "metrics": "ym:s:visits,ym:s:users",
            "dimensions": "ym:s:date",
            "date1": date_from,
            "date2": date_to,
            "sort": "ym:s:date",
        }
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(f"{BASE}/stat/v1/data", headers=self.headers, params=params)
            r.raise_for_status()
            data = r.json()

        result = []
        for row in data.get("data", []):
            dims = row.get("dimensions", [{}])
            dt = dims[0].get("name", "") if dims else ""
            vals = row.get("metrics", [0, 0])
            result.append({
                "date": dt,
                "visits": int(vals[0]) if vals else 0,
                "users": int(vals[1]) if len(vals) > 1 else 0,
            })
        return result

    async def get_goals(self, counter_id: int) -> list[dict]:
        """List of goals with conversions."""
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{BASE}/management/v1/counter/{counter_id}/goals",
                headers=self.headers,
            )
            r.raise_for_status()
            data = r.json()
        return [
            {"id": g["id"], "name": g.get("name", ""), "type": g.get("type", "")}
            for g in data.get("goals", [])
        ]


def get_metrika_client(db) -> MetrikaClient:
    from app.services.settings_service import get_setting
    token = get_setting("metrika_oauth_token", db)
    if not token:
        raise RuntimeError("Яндекс Метрика OAuth token не настроен. Добавьте в Настройки → API ключи.")
    return MetrikaClient(oauth_token=token)

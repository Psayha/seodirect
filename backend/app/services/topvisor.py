"""Topvisor API v2 client."""
from __future__ import annotations

import httpx

BASE_URL = "https://api.topvisor.com/v2/json"


def _headers(api_key: str) -> dict:
    return {
        "Authorization": f"bearer {api_key}",
        "Content-Type": "application/json",
    }


async def check_connection(api_key: str) -> dict:
    """Return {ok, message, projects_count}."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            f"{BASE_URL}/get/projects_2/index",
            headers=_headers(api_key),
            json={},
        )
    if r.status_code == 200:
        projects = r.json().get("result", [])
        return {"ok": True, "message": "Connected", "projects_count": len(projects)}
    return {"ok": False, "message": f"HTTP {r.status_code}", "projects_count": 0}


async def list_projects(api_key: str) -> list[dict]:
    """Return list of Topvisor projects [{id, name, site, ...}]."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{BASE_URL}/get/projects_2/index",
            headers=_headers(api_key),
            json={"fields": ["id", "name", "site", "searchers"]},
        )
    if r.status_code != 200:
        return []
    return r.json().get("result", [])


async def get_positions(
    api_key: str,
    project_id: int,
    date_from: str,
    date_to: str,
    searcher_id: int = 0,
    region_index: int = 0,
) -> list[dict]:
    """Return positions for all keywords in a Topvisor project.

    Each item: {keyword, position, date, url}
    """
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{BASE_URL}/get/positions_2/history",
            headers=_headers(api_key),
            json={
                "project_id": project_id,
                "regions_indexes": [region_index],
                "date1": date_from,
                "date2": date_to,
                "searcher_key": searcher_id,
                "fields": ["keyword_id", "keyword", "position", "date", "url"],
                "show_headers": True,
                "show_exists_dates": True,
                "show_tops": True,
            },
        )
    if r.status_code != 200:
        return []
    return r.json().get("result", {}).get("keywords", [])


async def get_keyword_volumes(api_key: str, project_id: int, phrases: list[str]) -> dict[str, int]:
    """Get search volumes for keywords via Topvisor.

    Returns {phrase: monthly_volume}.
    """
    if not phrases:
        return {}

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{BASE_URL}/get/keywords_2/forecast",
            headers=_headers(api_key),
            json={
                "project_id": project_id,
                "keywords": phrases,
                "regions": [225],
            },
        )
    if r.status_code != 200:
        return {}

    result: dict[str, int] = {}
    for item in r.json().get("result", []):
        result[item.get("keyword", "")] = item.get("shows", 0)
    return result


def get_topvisor_client_key(db) -> str | None:
    """Return Topvisor API key from settings, or None."""
    from app.services.settings_service import get_setting
    return get_setting("topvisor_api_key", db)

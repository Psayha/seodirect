"""Topvisor API v2 client."""
from __future__ import annotations

import httpx

BASE_URL = "https://api.topvisor.com/v2/json"


def _headers(api_key: str, user_id: str = "") -> dict:
    headers = {
        "Authorization": f"bearer {api_key}",
        "Content-Type": "application/json",
    }
    if user_id:
        headers["User-Id"] = user_id
    return headers


async def check_connection(api_key: str, user_id: str = "") -> dict:
    """Return {ok, message, projects_count}."""
    body = {"fields": ["id", "name"]}
    last_error = "Не удалось подключиться к Topvisor API"

    # Try v2 endpoint first, then legacy variant
    for endpoint in (f"{BASE_URL}/get/projects_2/index", f"{BASE_URL}/get/projects/index"):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(endpoint, headers=_headers(api_key, user_id), json=body)
        except httpx.TimeoutException:
            last_error = "Таймаут соединения с Topvisor API"
            continue
        except httpx.ConnectError:
            last_error = "Не удалось подключиться к api.topvisor.com"
            continue

        if r.status_code == 200:
            data = r.json()
            errors = data.get("errors")
            if errors:
                msg = errors[0].get("string", "Ошибка авторизации") if isinstance(errors, list) else str(errors)
                if "undefined method" in msg.lower():
                    last_error = f"Метод не поддерживается: {msg}"
                    continue
                return {"ok": False, "message": msg, "projects_count": 0}
            projects = data.get("result") or []
            return {"ok": True, "message": "Connected", "projects_count": len(projects)}
        elif r.status_code in (401, 403):
            return {"ok": False, "message": "Неверный API ключ или User ID", "projects_count": 0}
        else:
            last_error = f"HTTP {r.status_code} от Topvisor API"
            continue

    return {"ok": False, "message": last_error, "projects_count": 0}


async def list_projects(api_key: str, user_id: str = "") -> list[dict]:
    """Return list of Topvisor projects [{id, name, site, ...}]."""
    body = {"fields": ["id", "name", "site", "searchers"]}
    for endpoint in (f"{BASE_URL}/get/projects/index", f"{BASE_URL}/get/projects_2/index"):
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(endpoint, headers=_headers(api_key, user_id), json=body)
        if r.status_code != 200:
            continue
        data = r.json()
        errors = data.get("errors")
        if errors:
            err_msg = errors[0].get("string", "") if isinstance(errors, list) else ""
            if "undefined method" in err_msg.lower():
                continue
        result = data.get("result")
        if result is not None:
            return result
    return []


async def get_positions(
    api_key: str,
    project_id: int,
    date_from: str,
    date_to: str,
    searcher_id: int = 0,
    region_index: int = 0,
    user_id: str = "",
) -> list[dict]:
    """Return positions for all keywords in a Topvisor project.

    Each item: {keyword, position, date, url}
    """
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{BASE_URL}/get/positions_2/history",
            headers=_headers(api_key, user_id),
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


async def get_keyword_volumes(api_key: str, project_id: int, phrases: list[str], user_id: str = "") -> dict[str, int]:
    """Get search volumes for keywords via Topvisor.

    Returns {phrase: monthly_volume}.
    """
    if not phrases:
        return {}

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{BASE_URL}/get/keywords_2/forecast",
            headers=_headers(api_key, user_id),
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


async def get_snapshots(
    api_key: str,
    project_id: int,
    date: str = "",
    searcher_id: int = 0,
    region_index: int = 0,
    user_id: str = "",
) -> list[dict]:
    """Get SERP snapshots (competitor positions in search results).

    Each item: {keyword, date, position, url, snippet_title}
    """
    body: dict = {
        "project_id": project_id,
        "regions_indexes": [region_index],
        "searcher_key": searcher_id,
        "fields": ["keyword_id", "keyword", "date", "position", "url", "snippet_title"],
        "show_headers": True,
    }
    if date:
        body["date"] = date

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{BASE_URL}/get/snapshots_2/index",
            headers=_headers(api_key, user_id),
            json=body,
        )
    if r.status_code != 200:
        return []
    return r.json().get("result", {}).get("keywords", [])


def get_topvisor_client_key(db) -> str | None:
    """Return Topvisor API key from settings, or None."""
    from app.services.settings_service import get_setting
    return get_setting("topvisor_api_key", db)


def get_topvisor_user_id(db) -> str | None:
    """Return Topvisor User-Id from settings, or None."""
    from app.services.settings_service import get_setting
    return get_setting("topvisor_user_id", db)

"""Topvisor API v2 client."""
from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.topvisor.com/v2/json"


async def _post(client: httpx.AsyncClient, url: str, **kwargs) -> httpx.Response:
    """Wrapper around client.post that tracks API usage."""
    resp = await client.post(url, **kwargs)
    try:
        from app.services.usage import track_call
        track_call("topvisor")
    except Exception:
        pass
    return resp


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
    endpoint = f"{BASE_URL}/get/projects_2/projects"
    body = {"fields": ["id", "name"]}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await _post(client,endpoint, headers=_headers(api_key, user_id), json=body)
    except httpx.TimeoutException:
        return {"ok": False, "message": "Таймаут соединения с Topvisor API", "projects_count": 0}
    except httpx.ConnectError:
        return {"ok": False, "message": "Не удалось подключиться к api.topvisor.com", "projects_count": 0}

    logger.info("Topvisor check_connection: HTTP %s, body: %.500s", r.status_code, r.text)

    if r.status_code == 200:
        data = r.json()
        errors = data.get("errors")
        if errors:
            msg = errors[0].get("string", "Ошибка API") if isinstance(errors, list) else str(errors)
            return {"ok": False, "message": msg, "projects_count": 0}
        projects = data.get("result") or []
        return {"ok": True, "message": "Connected", "projects_count": len(projects)}
    elif r.status_code in (401, 403):
        return {"ok": False, "message": "Неверный API ключ или User ID", "projects_count": 0}
    else:
        # Log full response for debugging
        try:
            body_text = r.json()
        except Exception:
            body_text = r.text[:300]
        return {"ok": False, "message": f"HTTP {r.status_code}: {body_text}", "projects_count": 0}


async def list_projects(api_key: str, user_id: str = "") -> list[dict]:
    """Return list of Topvisor projects [{id, name, site, ...}]."""
    body = {"fields": ["id", "name", "site", "searchers"]}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await _post(client,
            f"{BASE_URL}/get/projects_2/projects",
            headers=_headers(api_key, user_id),
            json=body,
        )
    if r.status_code != 200:
        return []
    data = r.json()
    if data.get("errors"):
        return []
    return data.get("result") or []


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
        r = await _post(client,
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
        r = await _post(client,
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
    # snapshots_2/history uses region_index (int) and dates (array) per API docs
    today = date or __import__("datetime").date.today().isoformat()
    body: dict = {
        "project_id": project_id,
        "region_index": region_index,
        "searcher_key": searcher_id,
        "dates": [today],
        "fields": ["keyword_id", "keyword", "date", "position", "url", "snippet_title"],
        "show_headers": True,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        r = await _post(client,
            f"{BASE_URL}/get/snapshots_2/history",
            headers=_headers(api_key, user_id),
            json=body,
        )
    if r.status_code != 200:
        return []
    return r.json().get("result", {}).get("keywords", [])


async def get_positions_summary(
    api_key: str,
    project_id: int,
    date_from: str,
    date_to: str,
    region_index: int = 0,
    user_id: str = "",
) -> dict:
    """Return positions summary: avg position, visibility, TOP distribution."""
    async with httpx.AsyncClient(timeout=20) as client:
        r = await _post(client,
            f"{BASE_URL}/get/positions_2/summary",
            headers=_headers(api_key, user_id),
            json={
                "project_id": project_id,
                "regions_indexes": [region_index],
                "date1": date_from,
                "date2": date_to,
                "fields": ["avg", "visibility", "count", "tops"],
                "show_headers": True,
            },
        )
    if r.status_code != 200:
        return {}
    data = r.json()
    if data.get("errors"):
        return {}
    return data.get("result") or {}


async def get_competitors(
    api_key: str,
    project_id: int,
    date_from: str,
    date_to: str,
    region_index: int = 0,
    user_id: str = "",
) -> list[dict]:
    """Return competitor domains from SERP snapshots.

    Each item: {domain, avg_position, keywords_count, top3, top10}
    """
    async with httpx.AsyncClient(timeout=20) as client:
        r = await _post(client,
            f"{BASE_URL}/get/snapshots_2/competitors",
            headers=_headers(api_key, user_id),
            json={
                "project_id": project_id,
                "region_index": region_index,
                "date1": date_from,
                "date2": date_to,
                "show_exists_dates": True,
            },
        )
    if r.status_code != 200:
        return []
    data = r.json()
    if data.get("errors"):
        return []
    domains = data.get("result", {}).get("domains", {})
    if isinstance(domains, dict):
        return list(domains.values())
    return domains or []


async def trigger_positions_check(api_key: str, project_id: int, user_id: str = "") -> dict:
    """Trigger an on-demand positions check for a Topvisor project."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await _post(client,
            f"{BASE_URL}/edit/positions_2/checker/go",
            headers=_headers(api_key, user_id),
            json={"project_id": project_id},
        )
    if r.status_code != 200:
        return {"ok": False, "message": f"HTTP {r.status_code}"}
    data = r.json()
    if data.get("errors"):
        msg = data["errors"][0].get("string", "Ошибка") if isinstance(data["errors"], list) else str(data["errors"])
        return {"ok": False, "message": msg}
    return {"ok": True, "message": "Проверка позиций запущена"}


async def start_cluster_task(api_key: str, project_id: int, user_id: str = "") -> dict:
    """Start a Topvisor clustering task (by TOP-10) for a project."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await _post(client,
            f"{BASE_URL}/add/keywords_2/claster/task",
            headers=_headers(api_key, user_id),
            json={"project_id": project_id},
        )
    if r.status_code != 200:
        return {"ok": False, "message": f"HTTP {r.status_code}"}
    data = r.json()
    if data.get("errors"):
        msg = data["errors"][0].get("string", "Ошибка") if isinstance(data["errors"], list) else str(data["errors"])
        return {"ok": False, "message": msg}
    return {"ok": True, "message": "Кластеризация запущена"}


async def get_cluster_percent(api_key: str, project_id: int, user_id: str = "") -> int:
    """Return clustering completion percentage (0-100)."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await _post(client,
            f"{BASE_URL}/get/keywords_2/claster/percent",
            headers=_headers(api_key, user_id),
            json={"project_id": project_id},
        )
    if r.status_code != 200:
        return -1
    data = r.json()
    return data.get("result", -1)


async def get_project_keywords(api_key: str, project_id: int, user_id: str = "") -> list[dict]:
    """Return project keywords with cluster group info.

    Each item: {name, group_id}
    """
    async with httpx.AsyncClient(timeout=30) as client:
        r = await _post(client,
            f"{BASE_URL}/get/keywords_2/keywords",
            headers=_headers(api_key, user_id),
            json={
                "project_id": project_id,
                "fields": ["name", "group_id"],
            },
        )
    if r.status_code != 200:
        return []
    data = r.json()
    if data.get("errors"):
        return []
    return data.get("result") or []


async def add_keywords_to_project(
    api_key: str, project_id: int, phrases: list[str], group_id: int = 0, user_id: str = "",
) -> dict:
    """Add keywords to a Topvisor project. Returns {added: int, existing: int}.

    Topvisor API: POST /add/keywords_2/keywords
    Accepts up to 1000 keywords per request.
    """
    if not phrases:
        return {"added": 0, "existing": 0}
    import asyncio
    total_added = 0
    total_existing = 0
    batch_size = 500  # conservative batch size to avoid API throttling
    async with httpx.AsyncClient(timeout=60) as client:
        for i in range(0, len(phrases), batch_size):
            batch = phrases[i : i + batch_size]
            body: dict = {
                "project_id": project_id,
                "keywords": [{"name": p} for p in batch],
            }
            if group_id:
                body["group_id"] = group_id
            r = await _post(
                client,
                f"{BASE_URL}/add/keywords_2/keywords",
                headers=_headers(api_key, user_id),
                json=body,
            )
            if r.status_code == 200:
                data = r.json()
                if not data.get("errors"):
                    result = data.get("result", {})
                    total_added += result.get("added", 0) if isinstance(result, dict) else len(batch)
                    total_existing += result.get("existing", 0) if isinstance(result, dict) else 0
                else:
                    logger.warning("Topvisor add_keywords error: %s", data["errors"])
            elif r.status_code == 429:
                logger.warning("Topvisor add_keywords rate limited (429), waiting 10s")
                await asyncio.sleep(10)
                # Retry once
                r = await _post(client, f"{BASE_URL}/add/keywords_2/keywords", headers=_headers(api_key, user_id), json=body)
                if r.status_code == 200:
                    data = r.json()
                    if not data.get("errors"):
                        result = data.get("result", {})
                        total_added += result.get("added", 0) if isinstance(result, dict) else len(batch)
            else:
                logger.warning("Topvisor add_keywords HTTP %s", r.status_code)
            # Throttle between batches to avoid API rate limits
            if i + batch_size < len(phrases):
                await asyncio.sleep(2.0)
    logger.info("Topvisor add_keywords: %d phrases → added=%d, existing=%d", len(phrases), total_added, total_existing)
    return {"added": total_added, "existing": total_existing}


async def remove_all_keywords(api_key: str, project_id: int, user_id: str = "") -> bool:
    """Remove all keywords from a Topvisor project before re-uploading."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await _post(
            client,
            f"{BASE_URL}/del/keywords_2/keywords",
            headers=_headers(api_key, user_id),
            json={"project_id": project_id, "remove_all": True},
        )
    return r.status_code == 200


async def get_cluster_groups(api_key: str, project_id: int, user_id: str = "") -> list[dict]:
    """Return clustering groups: [{id, name, keywords: [{name}]}].

    Topvisor API: GET keywords with group info after clustering is done.
    """
    keywords = await get_project_keywords(api_key, project_id, user_id)
    if not keywords:
        return []
    # Group keywords by group_id
    groups: dict[str, list[str]] = {}
    for kw in keywords:
        gid = str(kw.get("group_id") or "0")
        groups.setdefault(gid, []).append(kw.get("name", ""))
    return [{"group_id": gid, "keywords": kws} for gid, kws in groups.items()]


async def wait_for_clustering(
    api_key: str, project_id: int, user_id: str = "",
    timeout_seconds: int = 300, poll_interval: int = 5,
) -> bool:
    """Poll clustering progress until done or timeout. Returns True if completed."""
    import asyncio
    elapsed = 0
    while elapsed < timeout_seconds:
        percent = await get_cluster_percent(api_key, project_id, user_id)
        if percent == 100:
            return True
        if percent == -1:
            # No active task — might have finished already
            return True
        await asyncio.sleep(poll_interval)
        elapsed += poll_interval
    return False


def get_topvisor_client_key(db) -> str | None:
    """Return Topvisor API key from settings, or None."""
    from app.services.settings_service import get_setting
    return get_setting("topvisor_api_key", db)


def get_topvisor_user_id(db) -> str | None:
    """Return Topvisor User-Id from settings, or None."""
    from app.services.settings_service import get_setting
    return get_setting("topvisor_user_id", db)

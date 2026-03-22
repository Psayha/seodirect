"""Google PageSpeed Insights API client."""
from __future__ import annotations

from typing import Optional

import httpx

PAGESPEED_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"


async def get_cwv(url: str, api_key: Optional[str] = None, strategy: str = "mobile") -> dict:
    """Fetch Core Web Vitals from Google PageSpeed Insights API."""
    params = {"url": url, "strategy": strategy, "category": "performance"}
    if api_key:
        params["key"] = api_key

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(PAGESPEED_API, params=params)
        r.raise_for_status()
        data = r.json()

    try:
        from app.services.usage import track_call
        track_call("pagespeed")
    except Exception:
        pass

    lhp = data.get("lighthouseResult", {}).get("audits", {})
    categories = data.get("lighthouseResult", {}).get("categories", {})

    return {
        "performance_score": int((categories.get("performance", {}).get("score", 0) or 0) * 100),
        "lcp": lhp.get("largest-contentful-paint", {}).get("numericValue"),  # ms
        "cls": lhp.get("cumulative-layout-shift", {}).get("numericValue"),
        "fid": lhp.get("max-potential-fid", {}).get("numericValue"),  # ms
        "fcp": lhp.get("first-contentful-paint", {}).get("numericValue"),
        "tbt": lhp.get("total-blocking-time", {}).get("numericValue"),
        "speed_index": lhp.get("speed-index", {}).get("numericValue"),
    }

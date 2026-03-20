"""GEO/AEO AI checker — queries OpenRouter online models and analyzes domain presence."""
import ipaddress
import re
import socket
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# AI crawlers to check for in robots.txt
AI_BOTS = [
    "ChatGPT-User",
    "GPTBot",
    "PerplexityBot",
    "ClaudeBot",
    "anthropic-ai",
    "Google-Extended",
]

# OpenRouter models available for GEO scanning
ONLINE_MODELS: dict[str, str] = {
    "perplexity/llama-3.1-sonar-small-128k-online": "Perplexity Sonar Small",
    "perplexity/llama-3.1-sonar-large-128k-online": "Perplexity Sonar Large",
    "openai/gpt-4o-mini": "GPT-4o mini",
    "openai/gpt-4o": "GPT-4o",
    "google/gemini-flash-1.5": "Gemini Flash 1.5",
}

DEFAULT_SCAN_MODELS = [
    "perplexity/llama-3.1-sonar-small-128k-online",
    "openai/gpt-4o-mini",
]


# ── SSRF protection ───────────────────────────────────────────────────────────

def _is_safe_url(url: str) -> bool:
    """Block private/internal IPs to prevent SSRF."""
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname
        if not hostname:
            return False
        ip = socket.gethostbyname(hostname)
        addr = ipaddress.ip_address(ip)
        return not (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_reserved
            or addr.is_multicast
        )
    except Exception:
        return False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _bare_domain(url_or_domain: str) -> str:
    """Return bare hostname without www."""
    if "://" in url_or_domain:
        return urlparse(url_or_domain).netloc.lower().removeprefix("www.")
    return url_or_domain.lower().removeprefix("www.").split("/")[0]


def _detect_position(text: str, domain: str) -> str | None:
    idx = text.lower().find(domain.lower())
    if idx == -1:
        return None
    ratio = idx / max(len(text), 1)
    if ratio < 0.33:
        return "first"
    if ratio < 0.67:
        return "middle"
    return "end"


def _detect_sentiment(text: str, domain: str) -> str:
    idx = text.lower().find(domain.lower())
    if idx == -1:
        return "neutral"
    window = text.lower()[max(0, idx - 200) : idx + 200]
    positives = [
        "лучший", "рекомендует", "надёжный", "качественный", "эксперт", "топ",
        "best", "recommend", "trusted", "quality", "expert", "top", "leading",
    ]
    negatives = [
        "плохой", "ненадёжный", "проблема", "мошенник", "избегайте",
        "bad", "unreliable", "problem", "scam", "avoid", "poor",
    ]
    pos = sum(1 for w in positives if w in window)
    neg = sum(1 for w in negatives if w in window)
    if pos > neg:
        return "positive"
    if neg > pos:
        return "negative"
    return "neutral"


def _extract_domains_from_text(text: str) -> list[str]:
    pattern = r"(?:https?://)?(?:www\.)?([a-zA-Z0-9\-]+(?:\.[a-zA-Z]{2,})+)"
    matches = re.findall(pattern, text)
    return list({m.lower() for m in matches if "." in m and len(m) < 100})


# ── Core AI check ─────────────────────────────────────────────────────────────

async def check_domain_in_ai_response(
    keyword: str,
    domain: str,
    model: str,
    openrouter_key: str,
) -> dict:
    """
    Send keyword to OpenRouter model and check if domain is mentioned.
    Returns dict with: mentioned, position, sentiment, sources, competitor_domains, snippet, error.
    """
    system = (
        "Ты — поисковый помощник. Отвечай на вопросы развёрнуто и по существу, "
        "как если бы тебя спросил обычный пользователь. "
        "Ссылайся на конкретные сайты, компании и ресурсы."
    )
    payload = {
        "model": model,
        "max_tokens": 800,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": keyword},
        ],
    }
    headers = {
        "Authorization": f"Bearer {openrouter_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://seodirect.tool",
        "X-Title": "SEODirect GEO",
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(OPENROUTER_URL, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        return {"mentioned": False, "error": str(exc)[:300]}

    choices = data.get("choices", [])
    text: str = choices[0].get("message", {}).get("content", "") if choices else ""
    # Perplexity sonar models include a top-level `citations` list
    citations: list[str] = data.get("citations", [])

    domain_bare = _bare_domain(domain)
    mentioned_in_text = domain_bare in text.lower()
    mentioned_in_citations = any(domain_bare in c.lower() for c in citations)
    mentioned = mentioned_in_text or mentioned_in_citations

    text_domains = _extract_domains_from_text(text)
    all_sources = list({*citations, *text_domains})
    competitor_domains = [d for d in all_sources if domain_bare not in d][:10]

    return {
        "mentioned": mentioned,
        "position": _detect_position(text, domain_bare) if mentioned else None,
        "sentiment": _detect_sentiment(text, domain_bare) if mentioned else None,
        "sources": citations[:10],
        "competitor_domains": competitor_domains,
        "snippet": text[:300].strip() if text else None,
        "error": None,
    }


# ── robots.txt AI-bot check ───────────────────────────────────────────────────

async def check_robots_for_ai_bots(site_url: str) -> dict:
    """Download robots.txt and check which AI crawlers are blocked."""
    parsed = urlparse(site_url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    if not _is_safe_url(robots_url):
        return {"blocked_bots": [], "cloudflare_detected": False, "error": "Unsafe URL"}

    blocked: list[str] = []
    cloudflare = False
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(robots_url, headers={"User-Agent": "SEODirectBot/1.0"})
        server = resp.headers.get("server", "").lower()
        cloudflare = "cf-ray" in resp.headers or "cloudflare" in server

        if resp.status_code == 200:
            current_agents: list[str] = []
            for raw_line in resp.text.splitlines():
                line = raw_line.strip()
                if line.lower().startswith("user-agent:"):
                    agent = line.split(":", 1)[1].strip()
                    current_agents = [agent]
                elif line.lower().startswith("disallow:") and current_agents:
                    path = line.split(":", 1)[1].strip()
                    if path in ("/", "/*"):
                        for bot in AI_BOTS:
                            if any(
                                bot.lower() == a.lower() or a == "*"
                                for a in current_agents
                            ):
                                if bot not in blocked:
                                    blocked.append(bot)
    except Exception as exc:
        return {"blocked_bots": blocked, "cloudflare_detected": cloudflare, "error": str(exc)[:200]}

    return {"blocked_bots": blocked, "cloudflare_detected": cloudflare, "error": None}


# ── llms.txt ──────────────────────────────────────────────────────────────────

async def check_llms_txt(site_url: str) -> dict:
    """Check if /llms.txt exists on the site."""
    parsed = urlparse(site_url)
    llms_url = f"{parsed.scheme}://{parsed.netloc}/llms.txt"
    if not _is_safe_url(llms_url):
        return {"has_llms_txt": False, "content": None, "error": "Unsafe URL"}
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(llms_url, headers={"User-Agent": "SEODirectBot/1.0"})
        if resp.status_code == 200:
            return {"has_llms_txt": True, "content": resp.text[:5000], "error": None}
        return {"has_llms_txt": False, "content": None, "error": None}
    except Exception as exc:
        return {"has_llms_txt": False, "content": None, "error": str(exc)[:200]}


# ── Freshness check ───────────────────────────────────────────────────────────

async def check_page_freshness(url: str) -> dict:
    """Determine content freshness via HTTP headers and meta tags."""
    if not _is_safe_url(url):
        return {"last_updated": None, "age_days": None, "status": "unknown", "error": "Unsafe URL"}
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "SEODirectBot/1.0"})

        last_modified: datetime | None = None

        # 1. Last-Modified header
        lm = resp.headers.get("last-modified")
        if lm:
            try:
                from email.utils import parsedate_to_datetime  # noqa: PLC0415
                last_modified = parsedate_to_datetime(lm)
            except Exception:
                pass

        # 2. og:updated_time / article:modified_time in meta
        if not last_modified:
            for prop in ("og:updated_time", "article:modified_time"):
                m = re.search(
                    rf'(?:property|name)="{re.escape(prop)}"[^>]*content="([^"]+)"',
                    resp.text,
                    re.IGNORECASE,
                )
                if m:
                    try:
                        from dateutil import parser as dp  # noqa: PLC0415
                        last_modified = dp.parse(m.group(1))
                        break
                    except Exception:
                        pass

        # 3. dateModified in JSON-LD
        if not last_modified:
            m = re.search(r'"dateModified"\s*:\s*"([^"]+)"', resp.text)
            if m:
                try:
                    from dateutil import parser as dp  # noqa: PLC0415
                    last_modified = dp.parse(m.group(1))
                except Exception:
                    pass

        if last_modified:
            tz = last_modified.tzinfo or timezone.utc
            age = (datetime.now(tz=tz) - last_modified).days
            status = "green" if age < 30 else "yellow" if age < 90 else "red"
            return {"last_updated": last_modified.date().isoformat(), "age_days": age, "status": status, "error": None}

        return {"last_updated": None, "age_days": None, "status": "unknown", "error": None}
    except Exception as exc:
        return {"last_updated": None, "age_days": None, "status": "unknown", "error": str(exc)[:200]}


# ── E-E-A-T basics ────────────────────────────────────────────────────────────

async def check_eeat_basics(site_url: str) -> dict:
    """Check for basic E-E-A-T signals: about and author pages."""
    parsed = urlparse(site_url)
    base = f"{parsed.scheme}://{parsed.netloc}"

    about_paths = ["/about", "/about-us", "/o-kompanii", "/o-nas", "/о-компании", "/о-нас"]
    author_paths = ["/authors", "/team", "/author", "/avtory", "/komanda", "/авторы", "/команда"]

    async def _exists(path: str) -> bool:
        url = f"{base}{path}"
        if not _is_safe_url(url):
            return False
        try:
            async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
                r = await client.head(url, headers={"User-Agent": "SEODirectBot/1.0"})
            return r.status_code == 200
        except Exception:
            return False

    import asyncio  # noqa: PLC0415
    about_results = await asyncio.gather(*[_exists(p) for p in about_paths])
    author_results = await asyncio.gather(*[_exists(p) for p in author_paths])

    return {
        "has_about_page": any(about_results),
        "has_author_page": any(author_results),
    }


# ── llms.txt generator ────────────────────────────────────────────────────────

def generate_llms_txt(
    project_name: str,
    site_url: str,
    niche: str | None,
    pages: list[dict],
) -> str:
    """Generate an llms.txt template based on project data."""
    description = f"Сайт компании в нише «{niche}»." if niche else "Корпоративный сайт."
    sections = "\n".join(
        f"- [{p.get('title') or p['url']}]({p['url']})"
        for p in pages[:20]
        if p.get("url")
    ) or "- (нет данных — запустите аудит сайта)"

    return (
        f"# {project_name}\n\n"
        f"> {description} URL: {site_url}\n\n"
        f"## Основные страницы\n\n"
        f"{sections}\n\n"
        f"## Для AI-ассистентов\n\n"
        f"Этот файл создан для помощи AI-краулерам в понимании структуры сайта.\n"
        f"Подробнее: https://llmstxt.org\n"
    )

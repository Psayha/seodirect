from __future__ import annotations

import asyncio
import ipaddress
import socket
import time
from dataclasses import dataclass, field
from io import StringIO
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup
from defusedxml import ElementTree as ET


def _is_private_or_reserved(hostname: str) -> bool:
    """Check if a hostname resolves to a private, loopback, or reserved IP."""
    try:
        # Resolve hostname to IP
        ip_str = socket.gethostbyname(hostname)
        ip = ipaddress.ip_address(ip_str)
        return ip.is_private or ip.is_reserved or ip.is_loopback or ip.is_link_local
    except (socket.gaierror, ValueError):
        return True  # If we can't resolve, block it


@dataclass
class PageData:
    url: str
    status_code: int
    load_time_ms: int
    title: str | None = None
    description: str | None = None
    h1: str | None = None
    h2_list: list[str] = field(default_factory=list)
    canonical: str | None = None
    og_title: str | None = None
    og_description: str | None = None
    og_image: str | None = None
    og_type: str | None = None
    robots_meta: str | None = None
    word_count: int = 0
    internal_links: list[str] = field(default_factory=list)
    external_links: list[str] = field(default_factory=list)
    images_without_alt: int = 0
    h1_count: int = 0
    last_modified: str | None = None
    priority: float | None = None


@dataclass
class SitemapEntry:
    url: str
    last_modified: str | None = None
    change_freq: str | None = None
    priority: float | None = None


class SiteCrawler:
    def __init__(
        self,
        base_url: str,
        crawl_delay_ms: int = 1000,
        timeout_seconds: int = 10,
        max_pages: int = 500,
        user_agent: str = "SEODirectBot/1.0 (internal)",
        respect_robots: bool = True,
    ):
        self.base_url = base_url.rstrip("/")
        parsed = urlparse(self.base_url)
        self.scheme = parsed.scheme
        self.netloc = parsed.netloc
        # SSRF protection: block private/reserved IPs
        if _is_private_or_reserved(parsed.hostname or ""):
            raise ValueError(f"Crawling private or reserved addresses is not allowed: {parsed.hostname}")
        self.crawl_delay_ms = crawl_delay_ms
        self.timeout = timeout_seconds
        self.max_pages = max_pages
        self.user_agent = user_agent
        self.respect_robots = respect_robots
        self.robot_parser = RobotFileParser()
        self._visited: set[str] = set()

    def _is_internal(self, url: str) -> bool:
        parsed = urlparse(url)
        return parsed.netloc == self.netloc or parsed.netloc == ""

    def _normalize(self, url: str, base: str = "") -> str | None:
        full = urljoin(base or self.base_url, url).split("#")[0].rstrip("/")
        parsed = urlparse(full)
        if parsed.scheme not in ("http", "https"):
            return None
        if parsed.netloc != self.netloc:
            return None
        return full

    async def _fetch(self, client: httpx.AsyncClient, url: str) -> tuple[int, str, int]:
        """Returns (status_code, html_body, load_time_ms)."""
        start = time.perf_counter()
        try:
            r = await client.get(url, timeout=self.timeout, follow_redirects=True)
            ms = int((time.perf_counter() - start) * 1000)
            return r.status_code, r.text, ms
        except Exception:
            ms = int((time.perf_counter() - start) * 1000)
            return 0, "", ms

    async def _load_robots(self, client: httpx.AsyncClient) -> None:
        robots_url = f"{self.base_url}/robots.txt"
        try:
            r = await client.get(robots_url, timeout=10, follow_redirects=True)
            if r.status_code == 200:
                self.robot_parser.parse(StringIO(r.text))
        except Exception:
            pass

    def _is_allowed(self, url: str) -> bool:
        if not self.respect_robots:
            return True
        return self.robot_parser.can_fetch(self.user_agent, url)

    def _get_sitemap_urls_from_robots(self) -> list[str]:
        return list(self.robot_parser.site_maps() or [])

    async def _parse_sitemap(self, client: httpx.AsyncClient, url: str, depth: int = 0) -> list[SitemapEntry]:
        if depth > 5:
            return []
        try:
            r = await client.get(url, timeout=15, follow_redirects=True)
            if r.status_code != 200:
                return []
        except Exception:
            return []

        try:
            root = ET.fromstring(r.text)
        except ET.ParseError:
            return []

        # Sitemap index
        if root.tag in ("{http://www.sitemaps.org/schemas/sitemap/0.9}sitemapindex", "sitemapindex"):
            entries: list[SitemapEntry] = []
            for loc in root.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc"):
                sub = await self._parse_sitemap(client, loc.text.strip(), depth + 1)
                entries.extend(sub)
            return entries

        # Regular sitemap
        entries = []
        for url_el in root.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}url"):
            loc = url_el.find("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")
            if loc is None or not loc.text:
                continue
            lastmod = url_el.find("{http://www.sitemaps.org/schemas/sitemap/0.9}lastmod")
            prio = url_el.find("{http://www.sitemaps.org/schemas/sitemap/0.9}priority")
            freq = url_el.find("{http://www.sitemaps.org/schemas/sitemap/0.9}changefreq")
            entries.append(SitemapEntry(
                url=loc.text.strip(),
                last_modified=lastmod.text.strip() if lastmod is not None and lastmod.text else None,
                priority=float(prio.text) if prio is not None and prio.text else None,
                change_freq=freq.text.strip() if freq is not None and freq.text else None,
            ))
        return entries

    async def _find_sitemap_entries(self, client: httpx.AsyncClient) -> list[SitemapEntry]:
        candidates = self._get_sitemap_urls_from_robots() or [
            f"{self.base_url}/sitemap.xml",
            f"{self.base_url}/sitemap_index.xml",
        ]
        entries: list[SitemapEntry] = []
        for url in candidates:
            found = await self._parse_sitemap(client, url)
            entries.extend(found)
            if entries:
                break
        return entries

    def _extract_page_data(self, url: str, html: str, status_code: int, load_time_ms: int,
                           last_modified: str | None = None, priority: float | None = None) -> PageData:
        soup = BeautifulSoup(html, "html.parser")

        def text(tag) -> str | None:
            return tag.get_text(strip=True) if tag else None

        title_tag = soup.find("title")
        desc_tag = soup.find("meta", attrs={"name": "description"})
        h1_tags = soup.find_all("h1")
        h1_tag = h1_tags[0] if h1_tags else None

        og = {}
        for meta in soup.find_all("meta", property=lambda p: p and p.startswith("og:")):
            og[meta.get("property")] = meta.get("content")

        robots_meta_tag = soup.find("meta", attrs={"name": "robots"})
        canonical_tag = soup.find("link", rel="canonical")

        # Links
        internal_links = []
        external_links = []
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not href or href.startswith(("mailto:", "tel:", "javascript:")):
                continue
            full = urljoin(url, href).split("#")[0]
            if urlparse(full).netloc == self.netloc:
                norm = self._normalize(full)
                if norm and norm not in self._visited:
                    internal_links.append(norm)
            else:
                external_links.append(full)

        # Word count
        body = soup.find("body")
        words = len(body.get_text(separator=" ").split()) if body else 0

        # Images without alt
        images_no_alt = sum(1 for img in soup.find_all("img") if not img.get("alt"))

        # H2 list
        h2_list = [h.get_text(strip=True) for h in soup.find_all("h2")][:20]

        return PageData(
            url=url,
            status_code=status_code,
            load_time_ms=load_time_ms,
            title=text(title_tag),
            description=desc_tag.get("content") if desc_tag else None,
            h1=text(h1_tag),
            h1_count=len(h1_tags),
            h2_list=h2_list,
            canonical=canonical_tag.get("href") if canonical_tag else None,
            og_title=og.get("og:title"),
            og_description=og.get("og:description"),
            og_image=og.get("og:image"),
            og_type=og.get("og:type"),
            robots_meta=robots_meta_tag.get("content") if robots_meta_tag else None,
            word_count=words,
            internal_links=list(set(internal_links))[:200],
            external_links=list(set(external_links))[:50],
            images_without_alt=images_no_alt,
            last_modified=last_modified,
            priority=priority,
        )

    async def crawl(self, on_page=None) -> list[PageData]:
        """
        Crawl the site. on_page(page_data, done, total) called after each page.
        Returns list of PageData.
        """
        results: list[PageData] = []
        headers = {"User-Agent": self.user_agent}

        async with httpx.AsyncClient(headers=headers) as client:
            await self._load_robots(client)

            # Try sitemap first
            sitemap_entries = await self._find_sitemap_entries(client)

            if sitemap_entries:
                urls_to_crawl = [
                    (e.url, e.last_modified, e.priority)
                    for e in sitemap_entries[:self.max_pages]
                    if self._is_allowed(e.url)
                ]
            else:
                # Fallback: crawl from root
                urls_to_crawl = [(self.base_url, None, None)]
                queue = [self.base_url]
                self._visited.add(self.base_url)

                # BFS to discover more pages
                for current_url in queue:
                    if len(urls_to_crawl) >= self.max_pages:
                        break
                    status_code, html, ms = await self._fetch(client, current_url)
                    if status_code == 200 and html:
                        soup = BeautifulSoup(html, "html.parser")
                        for a in soup.find_all("a", href=True):
                            norm = self._normalize(a["href"], current_url)
                            if norm and norm not in self._visited and self._is_allowed(norm):
                                self._visited.add(norm)
                                queue.append(norm)
                                urls_to_crawl.append((norm, None, None))

            total = len(urls_to_crawl)
            for done_count, (url, last_mod, prio) in enumerate(urls_to_crawl, 1):
                if not self._is_allowed(url):
                    continue
                status_code, html, ms = await self._fetch(client, url)
                if status_code == 200 and html:
                    page = self._extract_page_data(url, html, status_code, ms, last_mod, prio)
                else:
                    page = PageData(url=url, status_code=status_code, load_time_ms=ms,
                                    last_modified=last_mod, priority=prio)
                results.append(page)
                if on_page:
                    on_page(page, done_count, total)
                if self.crawl_delay_ms > 0:
                    await asyncio.sleep(self.crawl_delay_ms / 1000)

        return results

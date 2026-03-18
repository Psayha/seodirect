import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Integer, Float, Text, JSON, Boolean, ForeignKey, Enum as SAEnum, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CrawlStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class CrawlSession(Base):
    __tablename__ = "crawl_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    status: Mapped[CrawlStatus] = mapped_column(SAEnum(CrawlStatus), nullable=False, default=CrawlStatus.PENDING)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pages_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pages_done: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class Page(Base):
    __tablename__ = "pages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    crawl_session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("crawl_sessions.id"), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    h1: Mapped[str | None] = mapped_column(String(512), nullable=True)
    h2_list: Mapped[list | None] = mapped_column(JSON, nullable=True)
    canonical: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    og_title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    og_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    og_image: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    og_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    robots_meta: Mapped[str | None] = mapped_column(String(255), nullable=True)
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    internal_links: Mapped[list | None] = mapped_column(JSON, nullable=True)
    external_links: Mapped[list | None] = mapped_column(JSON, nullable=True)
    images_without_alt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    h1_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    load_time_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_modified: Mapped[str | None] = mapped_column(String(100), nullable=True)
    priority: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Redirect chain (list of URLs if page was redirected through multiple hops)
    redirect_chain: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Core Web Vitals
    cwv_lcp: Mapped[float | None] = mapped_column(Float, nullable=True)
    cwv_cls: Mapped[float | None] = mapped_column(Float, nullable=True)
    cwv_fid: Mapped[float | None] = mapped_column(Float, nullable=True)

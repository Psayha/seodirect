"""GEO/AEO models — AI visibility tracking and AI-readiness auditing."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class GeoKeyword(Base):
    """A keyword selected by the user for GEO/AEO tracking."""

    __tablename__ = "geo_keywords"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    keyword: Mapped[str] = mapped_column(String(500), nullable=False)
    # semantic | topvisor | manual
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class GeoScanResult(Base):
    """Result of one AI-model check for one keyword."""

    __tablename__ = "geo_scan_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    keyword_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("geo_keywords.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # e.g. "perplexity/llama-3.1-sonar-small-128k-online"
    ai_model: Mapped[str] = mapped_column(String(120), nullable=False)
    mentioned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # first | middle | end
    mention_position: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # positive | neutral | negative
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # URLs cited by the model (Perplexity citations field)
    sources_json: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # other domains mentioned in the response
    competitor_domains_json: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # first 300 chars of AI response
    response_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class AiReadinessAudit(Base):
    """AI-readiness audit for a project (robots, llms.txt, E-E-A-T, freshness)."""

    __tablename__ = "ai_readiness_audits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # AI bot blocking
    blocked_bots_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    cloudflare_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # llms.txt
    has_llms_txt: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    llms_txt_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    # E-E-A-T basics
    has_about_page: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_author_page: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Freshness: {url: {last_updated, age_days, status}}
    pages_freshness_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Overall score 0-100
    ai_readiness_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Full raw audit data for detailed display
    audit_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

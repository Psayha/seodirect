import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class SemanticMode(str, enum.Enum):
    SEO = "seo"
    DIRECT = "direct"


class SemanticProject(Base, TimestampMixin):
    __tablename__ = "semantic_projects"
    __table_args__ = (
        UniqueConstraint("project_id", "mode", name="uq_semantic_project_mode"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    mode: Mapped[SemanticMode] = mapped_column(
        Enum(SemanticMode, values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    region_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Yandex region ID
    is_seasonal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    brand_check_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    needs_brand_check: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # 0=created, 1=masks done, 2=expanded, 3=cleaned, 4=clustered
    pipeline_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # niche template overrides, competitor crawl cache


class SemanticKeyword(Base, TimestampMixin):
    __tablename__ = "semantic_keywords"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    semantic_project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("semantic_projects.id"), nullable=False, index=True
    )

    phrase: Mapped[str] = mapped_column(String(512), nullable=False)

    # 4 Wordstat frequency types
    frequency_base: Mapped[int | None] = mapped_column(Integer, nullable=True)    # WS
    frequency_phrase: Mapped[int | None] = mapped_column(Integer, nullable=True)  # «WS»
    frequency_exact: Mapped[int | None] = mapped_column(Integer, nullable=True)   # «!WS»
    frequency_order: Mapped[int | None] = mapped_column(Integer, nullable=True)   # [WS]

    kw_type: Mapped[str | None] = mapped_column(String(10), nullable=True)    # ВЧ | СЧ | НЧ
    intent: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="wordstat")

    geo_dependent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_branded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_seasonal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_competitor: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_excluded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    excluded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    cluster_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    monthly_dynamics: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Mask-specific
    is_mask: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mask_selected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class KeywordCache(Base):
    __tablename__ = "keyword_cache"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phrase: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    region_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    frequency_base: Mapped[int | None] = mapped_column(Integer, nullable=True)
    frequency_phrase: Mapped[int | None] = mapped_column(Integer, nullable=True)
    frequency_exact: Mapped[int | None] = mapped_column(Integer, nullable=True)
    frequency_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    monthly_dynamics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    cached_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CleaningSnapshot(Base):
    __tablename__ = "cleaning_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    semantic_project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("semantic_projects.id"), nullable=False, index=True
    )
    snapshot: Mapped[list] = mapped_column(JSON, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="авто-очистка")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SemanticCluster(Base, TimestampMixin):
    __tablename__ = "semantic_clusters"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    semantic_project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("semantic_projects.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    intent: Mapped[str | None] = mapped_column(String(50), nullable=True)
    priority: Mapped[str | None] = mapped_column(String(20), nullable=True)
    campaign_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # search | rsa (Direct mode)
    related_cluster_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    suggested_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    suggested_description: Mapped[str | None] = mapped_column(Text, nullable=True)


class MarketingMinusWord(Base):
    __tablename__ = "marketing_minus_words"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    semantic_project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("semantic_projects.id"), nullable=False, index=True
    )
    word: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

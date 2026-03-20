import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TaskType(str, enum.Enum):
    CRAWL = "crawl"
    GENERATE_STRATEGY = "generate_strategy"
    GENERATE_KEYWORDS = "generate_keywords"
    GENERATE_ADS = "generate_ads"
    GENERATE_NEGATIVE_KW = "generate_negative_kw"
    CHECK_FREQUENCIES = "check_frequencies"
    GENERATE_SEO_META = "generate_seo_meta"
    GENERATE_SCHEMA_BULK = "generate_schema_bulk"
    SEMANTIC_EXPAND = "semantic_expand"
    SEMANTIC_CLUSTER = "semantic_cluster"
    GEO_SCAN = "geo_scan"
    GEO_AUDIT = "geo_audit"


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    type: Mapped[TaskType] = mapped_column(Enum(TaskType, values_callable=lambda x: [e.value for e in x]), nullable=False)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus, values_callable=lambda x: [e.value for e in x]), nullable=False, default=TaskStatus.PENDING)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

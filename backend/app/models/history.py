"""ProjectEvent — audit log of all actions per project."""
import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EventType(str, enum.Enum):
    PROJECT_CREATED = "project_created"
    PROJECT_UPDATED = "project_updated"
    BRIEF_UPDATED = "brief_updated"
    CRAWL_STARTED = "crawl_started"
    CRAWL_COMPLETED = "crawl_completed"
    STRATEGY_GENERATED = "strategy_generated"
    STRATEGY_UPDATED = "strategy_updated"
    CAMPAIGN_CREATED = "campaign_created"
    CAMPAIGN_UPDATED = "campaign_updated"
    CAMPAIGN_DELETED = "campaign_deleted"
    GROUP_CREATED = "group_created"
    KEYWORDS_GENERATED = "keywords_generated"
    ADS_GENERATED = "ads_generated"
    NEGATIVE_KW_GENERATED = "negative_kw_generated"
    SEO_META_GENERATED = "seo_meta_generated"
    EXPORT_DOWNLOADED = "export_downloaded"
    MEDIAPLAN_UPDATED = "mediaplan_updated"
    MONTHLY_REPORT_GENERATED = "monthly_report_generated"


class ProjectEvent(Base):
    __tablename__ = "project_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    user_login: Mapped[str | None] = mapped_column(String(255), nullable=True)  # denormalized for speed
    event_type: Mapped[EventType] = mapped_column(Enum(EventType), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

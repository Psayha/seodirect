import enum
import uuid

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ArticleStatus(str, enum.Enum):
    IDEA = "idea"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ContentPlanArticle(Base, TimestampMixin):
    __tablename__ = "content_plan_articles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    target_keyword: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cluster: Mapped[str | None] = mapped_column(String(255), nullable=True)
    intent: Mapped[str | None] = mapped_column(String(100), nullable=True)  # informational/commercial/transactional
    status: Mapped[ArticleStatus] = mapped_column(Enum(ArticleStatus, values_callable=lambda x: [e.value for e in x]), nullable=False, default=ArticleStatus.IDEA)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    due_date: Mapped[str | None] = mapped_column(String(20), nullable=True)  # ISO date string
    assigned_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    word_count_target: Mapped[int | None] = mapped_column(Integer, nullable=True)

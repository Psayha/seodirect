import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SeoPageMeta(Base):
    """Recommended meta / OG tags per page per project (generated or manually edited)."""

    __tablename__ = "seo_page_meta"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    page_url: Mapped[str] = mapped_column(String(2048), nullable=False)

    # Recommended meta tags
    rec_title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    rec_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Recommended OG tags
    rec_og_title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    rec_og_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Twitter Card
    twitter_card: Mapped[str | None] = mapped_column(String(50), nullable=True)   # summary | summary_large_image
    twitter_title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    twitter_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    manually_edited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Schema.org and FAQ content
    schema_org_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    faq_json: Mapped[str | None] = mapped_column(Text, nullable=True)

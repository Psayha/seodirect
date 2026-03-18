import uuid

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Brief(Base, TimestampMixin):
    __tablename__ = "briefs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, unique=True)
    niche: Mapped[str | None] = mapped_column(Text, nullable=True)
    products: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_segment: Mapped[str | None] = mapped_column(String(50), nullable=True)
    geo: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_audience: Mapped[str | None] = mapped_column(Text, nullable=True)
    pains: Mapped[str | None] = mapped_column(Text, nullable=True)
    usp: Mapped[str | None] = mapped_column(Text, nullable=True)
    competitors_urls: Mapped[list | None] = mapped_column(JSON, nullable=True)
    campaign_goal: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ad_geo: Mapped[list | None] = mapped_column(JSON, nullable=True)
    excluded_geo: Mapped[str | None] = mapped_column(Text, nullable=True)
    monthly_budget: Mapped[float | None] = mapped_column(String(50), nullable=True)
    restrictions: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)

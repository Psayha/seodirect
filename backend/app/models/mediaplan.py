"""MediaPlan — monthly budget breakdown per project."""
import uuid

from sqlalchemy import String, Float, Integer, JSON, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from app.db.base import Base


class MediaPlan(Base):
    """One record per project — stores monthly plan as JSON rows."""

    __tablename__ = "media_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, unique=True
    )
    # JSON list of MonthEntry objects:
    # [{"month": 1, "year": 2025, "pct": 8.0, "budget": 40000,
    #   "forecast_clicks": 1200, "forecast_leads": 60, "cpa": 667}]
    rows: Mapped[list | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

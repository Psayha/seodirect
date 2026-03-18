import uuid
import enum

from sqlalchemy import String, Text, Integer, Float, JSON, ForeignKey, Enum, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class KeywordTemperature(str, enum.Enum):
    HOT = "hot"
    WARM = "warm"
    COLD = "cold"


class KeywordStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    LOW_FREQUENCY = "low_frequency"


class AdStatus(str, enum.Enum):
    DRAFT = "draft"
    READY = "ready"
    REVIEW = "review"
    PAUSED = "paused"


class CampaignStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    DRAFT = "draft"


class Campaign(Base, TimestampMixin):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[CampaignStatus] = mapped_column(Enum(CampaignStatus), nullable=False, default=CampaignStatus.DRAFT)
    geo: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    strategy_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    budget_monthly: Mapped[float | None] = mapped_column(Float, nullable=True)
    sitelinks: Mapped[list | None] = mapped_column(JSON, nullable=True)


class AdGroup(Base, TimestampMixin):
    __tablename__ = "ad_groups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")


class Keyword(Base):
    __tablename__ = "keywords"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ad_group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ad_groups.id"), nullable=False)
    phrase: Mapped[str] = mapped_column(String(512), nullable=False)
    frequency: Mapped[int | None] = mapped_column(Integer, nullable=True)
    frequency_updated_at: Mapped[str | None] = mapped_column(String(50), nullable=True)
    temperature: Mapped[KeywordTemperature | None] = mapped_column(Enum(KeywordTemperature), nullable=True)
    status: Mapped[KeywordStatus] = mapped_column(Enum(KeywordStatus), nullable=False, default=KeywordStatus.ACTIVE)
    match_type: Mapped[str] = mapped_column(String(50), nullable=False, default="broad")


class NegativeKeyword(Base):
    __tablename__ = "negative_keywords"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=True)
    phrase: Mapped[str] = mapped_column(String(512), nullable=False)
    block: Mapped[str | None] = mapped_column(String(100), nullable=True)


class Ad(Base, TimestampMixin):
    __tablename__ = "ads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ad_group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ad_groups.id"), nullable=False)
    headline1: Mapped[str | None] = mapped_column(String(56), nullable=True)
    headline2: Mapped[str | None] = mapped_column(String(30), nullable=True)
    headline3: Mapped[str | None] = mapped_column(String(30), nullable=True)
    text: Mapped[str | None] = mapped_column(String(81), nullable=True)
    display_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[AdStatus] = mapped_column(Enum(AdStatus), nullable=False, default=AdStatus.DRAFT)
    variant: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

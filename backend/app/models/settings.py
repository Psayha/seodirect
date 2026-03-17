import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Setting(Base):
    __tablename__ = "settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    value_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)


class SystemPrompt(Base):
    __tablename__ = "system_prompts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    module: Mapped[str] = mapped_column(String(100), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

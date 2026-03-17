"""Add media_plans, project_events tables.

Revision ID: 0003
Revises: 0002
Create Date: 2025-03-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── media_plans ────────────────────────────────────────────────────────────
    op.create_table(
        "media_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False, unique=True),
        sa.Column("rows", postgresql.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── project_events ─────────────────────────────────────────────────────────
    op.create_table(
        "project_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("user_login", sa.String(255), nullable=True),
        sa.Column(
            "event_type",
            sa.Enum(
                "project_created", "project_updated", "brief_updated",
                "crawl_started", "crawl_completed",
                "strategy_generated", "strategy_updated",
                "campaign_created", "campaign_updated", "campaign_deleted",
                "group_created", "keywords_generated", "ads_generated",
                "negative_kw_generated", "seo_meta_generated",
                "export_downloaded", "mediaplan_updated",
                name="eventtype",
            ),
            nullable=False,
        ),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_project_events_project_id", "project_events", ["project_id"])
    op.create_index("ix_project_events_created_at", "project_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_project_events_created_at", table_name="project_events")
    op.drop_index("ix_project_events_project_id", table_name="project_events")
    op.drop_table("project_events")
    op.drop_table("media_plans")
    op.execute("DROP TYPE IF EXISTS eventtype")

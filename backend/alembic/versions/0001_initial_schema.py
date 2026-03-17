"""initial_schema

Revision ID: 0001
Revises:
Create Date: 2025-03-17 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("login", sa.String(100), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("super_admin", "admin", "specialist", "viewer", name="userrole"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_login", "users", ["login"])

    # ── projects ───────────────────────────────────────────────────────────────
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("client_name", sa.String(255), nullable=False),
        sa.Column("url", sa.String(2048), nullable=False),
        sa.Column("specialist_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("budget", sa.Numeric(12, 2), nullable=True),
        sa.Column(
            "status",
            sa.Enum("active", "paused", "completed", "archived", name="projectstatus"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── briefs ─────────────────────────────────────────────────────────────────
    op.create_table(
        "briefs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False, unique=True),
        sa.Column("niche", sa.Text(), nullable=True),
        sa.Column("products", sa.Text(), nullable=True),
        sa.Column("price_segment", sa.String(50), nullable=True),
        sa.Column("geo", sa.Text(), nullable=True),
        sa.Column("target_audience", sa.Text(), nullable=True),
        sa.Column("pains", sa.Text(), nullable=True),
        sa.Column("usp", sa.Text(), nullable=True),
        sa.Column("competitors_urls", postgresql.JSON(), nullable=True),
        sa.Column("campaign_goal", sa.String(100), nullable=True),
        sa.Column("ad_geo", postgresql.JSON(), nullable=True),
        sa.Column("excluded_geo", sa.Text(), nullable=True),
        sa.Column("monthly_budget", sa.String(50), nullable=True),
        sa.Column("restrictions", sa.Text(), nullable=True),
        sa.Column("raw_data", postgresql.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── crawl_sessions ─────────────────────────────────────────────────────────
    op.create_table(
        "crawl_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "running", "done", "failed", name="crawlstatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pages_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pages_done", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
    )

    # ── pages ──────────────────────────────────────────────────────────────────
    op.create_table(
        "pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("crawl_session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crawl_sessions.id"), nullable=False),
        sa.Column("url", sa.String(2048), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(512), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("h1", sa.String(512), nullable=True),
        sa.Column("h2_list", postgresql.JSON(), nullable=True),
        sa.Column("canonical", sa.String(2048), nullable=True),
        sa.Column("og_title", sa.String(512), nullable=True),
        sa.Column("og_description", sa.Text(), nullable=True),
        sa.Column("og_image", sa.String(2048), nullable=True),
        sa.Column("og_type", sa.String(100), nullable=True),
        sa.Column("robots_meta", sa.String(255), nullable=True),
        sa.Column("word_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("internal_links", postgresql.JSON(), nullable=True),
        sa.Column("external_links", postgresql.JSON(), nullable=True),
        sa.Column("images_without_alt", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("load_time_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_modified", sa.String(100), nullable=True),
        sa.Column("priority", sa.Float(), nullable=True),
    )

    # ── campaigns ──────────────────────────────────────────────────────────────
    op.create_table(
        "campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(100), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "status",
            sa.Enum("active", "paused", "draft", name="campaignstatus"),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("geo", postgresql.JSON(), nullable=True),
        sa.Column("strategy_text", sa.Text(), nullable=True),
        sa.Column("budget_monthly", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── ad_groups ──────────────────────────────────────────────────────────────
    op.create_table(
        "ad_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── keywords ───────────────────────────────────────────────────────────────
    op.create_table(
        "keywords",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ad_group_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ad_groups.id"), nullable=False),
        sa.Column("phrase", sa.String(512), nullable=False),
        sa.Column("frequency", sa.Integer(), nullable=True),
        sa.Column("frequency_updated_at", sa.String(50), nullable=True),
        sa.Column(
            "temperature",
            sa.Enum("hot", "warm", "cold", name="keywordtemperature"),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.Enum("active", "paused", "low_frequency", name="keywordstatus"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("match_type", sa.String(50), nullable=False, server_default="broad"),
    )

    # ── negative_keywords ──────────────────────────────────────────────────────
    op.create_table(
        "negative_keywords",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id"), nullable=True),
        sa.Column("phrase", sa.String(512), nullable=False),
        sa.Column("block", sa.String(100), nullable=True),
    )

    # ── ads ────────────────────────────────────────────────────────────────────
    op.create_table(
        "ads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ad_group_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ad_groups.id"), nullable=False),
        sa.Column("headline1", sa.String(56), nullable=True),
        sa.Column("headline2", sa.String(30), nullable=True),
        sa.Column("headline3", sa.String(30), nullable=True),
        sa.Column("text", sa.String(81), nullable=True),
        sa.Column("display_url", sa.String(255), nullable=True),
        sa.Column("utm", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("draft", "ready", "review", name="adstatus"),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("variant", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── settings ───────────────────────────────────────────────────────────────
    op.create_table(
        "settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(255), nullable=False, unique=True),
        sa.Column("value_encrypted", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_settings_key", "settings", ["key"])

    # ── system_prompts ─────────────────────────────────────────────────────────
    op.create_table(
        "system_prompts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, unique=True),
        sa.Column("prompt_text", sa.Text(), nullable=False),
        sa.Column("module", sa.String(100), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── tasks ──────────────────────────────────────────────────────────────────
    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("celery_task_id", sa.String(255), nullable=True),
        sa.Column(
            "type",
            sa.Enum(
                "crawl", "generate_strategy", "generate_keywords",
                "generate_ads", "generate_negative_kw", "check_frequencies",
                name="tasktype",
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("pending", "running", "success", "failed", name="taskstatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("result", postgresql.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_tasks_celery_task_id", "tasks", ["celery_task_id"])


def downgrade() -> None:
    op.drop_table("tasks")
    op.drop_table("system_prompts")
    op.drop_table("settings")
    op.drop_table("ads")
    op.drop_table("negative_keywords")
    op.drop_table("keywords")
    op.drop_table("ad_groups")
    op.drop_table("campaigns")
    op.drop_table("pages")
    op.drop_table("crawl_sessions")
    op.drop_table("briefs")
    op.drop_table("projects")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS userrole")
    op.execute("DROP TYPE IF EXISTS projectstatus")
    op.execute("DROP TYPE IF EXISTS crawlstatus")
    op.execute("DROP TYPE IF EXISTS campaignstatus")
    op.execute("DROP TYPE IF EXISTS keywordtemperature")
    op.execute("DROP TYPE IF EXISTS keywordstatus")
    op.execute("DROP TYPE IF EXISTS adstatus")
    op.execute("DROP TYPE IF EXISTS tasktype")
    op.execute("DROP TYPE IF EXISTS taskstatus")

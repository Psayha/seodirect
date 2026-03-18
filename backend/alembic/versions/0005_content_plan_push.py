"""Add content_plan_articles and push_subscriptions tables.

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── content_plan_articles ─────────────────────────────────────────────────
    op.create_table(
        "content_plan_articles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "status",
            sa.Enum("idea", "in_progress", "review", "published", "archived", name="articlestatus"),
            nullable=False,
            server_default="idea",
        ),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("target_keyword", sa.String(255), nullable=True),
        sa.Column("cluster", sa.String(255), nullable=True),
        sa.Column("intent", sa.String(100), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("due_date", sa.String(20), nullable=True),
        sa.Column("assigned_to", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("url", sa.String(2048), nullable=True),
        sa.Column("word_count_target", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_content_plan_project", "content_plan_articles", ["project_id"])

    # ── push_subscriptions ────────────────────────────────────────────────────
    op.create_table(
        "push_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False, unique=True),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_push_sub_user", "push_subscriptions", ["user_id"])


def downgrade() -> None:
    op.drop_table("push_subscriptions")
    op.drop_table("content_plan_articles")
    op.execute("DROP TYPE IF EXISTS articlestatus")

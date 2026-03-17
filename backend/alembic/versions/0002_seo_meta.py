"""Add seo_page_meta table and generate_seo_meta task type.

Revision ID: 0002
Revises: 0001
Create Date: 2025-03-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new value to tasktype enum
    op.execute("ALTER TYPE tasktype ADD VALUE IF NOT EXISTS 'generate_seo_meta'")

    # Create seo_page_meta table
    op.create_table(
        "seo_page_meta",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("page_url", sa.String(2048), nullable=False),
        sa.Column("rec_title", sa.String(512), nullable=True),
        sa.Column("rec_description", sa.Text(), nullable=True),
        sa.Column("rec_og_title", sa.String(512), nullable=True),
        sa.Column("rec_og_description", sa.Text(), nullable=True),
        sa.Column("manually_edited", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_seo_page_meta_project_url", "seo_page_meta", ["project_id", "page_url"])


def downgrade() -> None:
    op.drop_index("ix_seo_page_meta_project_url", table_name="seo_page_meta")
    op.drop_table("seo_page_meta")

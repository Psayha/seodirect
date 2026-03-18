"""Add composite indexes for common query patterns

Revision ID: 0012
Revises: 0011
Create Date: 2026-03-18
"""
from alembic import op

revision = "0012"
down_revision = "0011"


def upgrade() -> None:
    # Composite index for soft-deleted project queries
    op.create_index(
        "ix_projects_deleted_at_created_at",
        "projects",
        ["deleted_at", "created_at"],
        if_not_exists=True,
    )
    # Composite index for SeoPageMeta lookups by project+page
    op.create_index(
        "ix_seo_page_meta_project_page",
        "seo_page_meta",
        ["project_id", "page_url"],
        unique=True,
        if_not_exists=True,
    )
    # Composite index for MediaPlan (one per project)
    op.create_index(
        "ix_media_plans_project_id_unique",
        "media_plans",
        ["project_id"],
        unique=True,
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_media_plans_project_id_unique", table_name="media_plans")
    op.drop_index("ix_seo_page_meta_project_page", table_name="seo_page_meta")
    op.drop_index("ix_projects_deleted_at_created_at", table_name="projects")

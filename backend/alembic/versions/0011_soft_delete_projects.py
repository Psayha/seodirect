"""Add soft delete support for projects (deleted_at column)

Revision ID: 0011
Revises: 0010
Create Date: 2026-03-18
"""
import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_projects_deleted_at", "projects", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_projects_deleted_at", table_name="projects")
    op.drop_column("projects", "deleted_at")

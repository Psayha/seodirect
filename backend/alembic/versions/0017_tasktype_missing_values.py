"""Add missing TaskType enum values: generate_schema_bulk, semantic_expand, semantic_cluster

Revision ID: 0017
Revises: 0016
Create Date: 2026-03-20
"""
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE tasktype ADD VALUE IF NOT EXISTS 'generate_schema_bulk'")
    op.execute("ALTER TYPE tasktype ADD VALUE IF NOT EXISTS 'semantic_expand'")
    op.execute("ALTER TYPE tasktype ADD VALUE IF NOT EXISTS 'semantic_cluster'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; downgrade is a no-op
    pass

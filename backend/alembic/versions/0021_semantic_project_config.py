"""Add config JSON column to semantic_projects for niche template overrides.

Revision ID: 0021
Revises: 0020
"""

from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("semantic_projects", sa.Column("config", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("semantic_projects", "config")

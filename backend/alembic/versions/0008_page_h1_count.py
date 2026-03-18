"""Add h1_count column to pages table.

Revision ID: 0008
Revises: 0007
Create Date: 2026-03-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pages",
        sa.Column("h1_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("pages", "h1_count")

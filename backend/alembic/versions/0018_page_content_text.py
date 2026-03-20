"""Add content_text column to pages for UVP/semantic analysis.

Revision ID: 0018
Revises: 0017
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pages", sa.Column("content_text", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("pages", "content_text")

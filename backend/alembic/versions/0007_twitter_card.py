"""Add Twitter Card fields to seo_page_meta.

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("seo_page_meta", sa.Column("twitter_card", sa.String(50), nullable=True))
    op.add_column("seo_page_meta", sa.Column("twitter_title", sa.String(512), nullable=True))
    op.add_column("seo_page_meta", sa.Column("twitter_description", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("seo_page_meta", "twitter_description")
    op.drop_column("seo_page_meta", "twitter_title")
    op.drop_column("seo_page_meta", "twitter_card")

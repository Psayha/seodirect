"""Widen semantic_clusters.suggested_title from VARCHAR(35) to VARCHAR(255).

Revision ID: 0020
Revises: 0019
"""

from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "semantic_clusters",
        "suggested_title",
        existing_type=sa.String(35),
        type_=sa.String(255),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "semantic_clusters",
        "suggested_title",
        existing_type=sa.String(255),
        type_=sa.String(35),
        existing_nullable=True,
    )

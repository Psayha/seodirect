"""Add topvisor_project_id to projects table.

Revision ID: 0004
Revises: 0003
Create Date: 2025-03-17
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("topvisor_project_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "topvisor_project_id")

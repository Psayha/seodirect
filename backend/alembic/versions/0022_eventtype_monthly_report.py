"""Add missing eventtype enum values: monthly_report_generated and semantic_* types.

Revision ID: 0022
Revises: 0021
"""

from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'monthly_report_generated'")
    op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'semantic_created'")
    op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'semantic_deleted'")
    op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'semantic_autopilot'")
    op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'semantic_masks_collected'")
    op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'semantic_expand'")
    op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'semantic_clean'")
    op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'semantic_cluster'")
    op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'semantic_export'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; no-op.
    pass

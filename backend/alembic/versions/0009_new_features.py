"""Add new tables and columns for features 1-20 and 23.

Revision ID: 0009
Revises: 0008
Create Date: 2026-03-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── New tables ──────────────────────────────────────────────────────────

    op.create_table(
        "seo_meta_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_url", sa.String(2048), nullable=False),
        sa.Column("field_name", sa.String(255), nullable=False),
        sa.Column("old_value", sa.Text, nullable=True),
        sa.Column("new_value", sa.Text, nullable=True),
        sa.Column("changed_by", sa.String(255), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "project_access_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token", sa.String(255), nullable=False, unique=True),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column("created_by", sa.String(255), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_project_access_tokens_token", "project_access_tokens", ["token"], unique=True)

    op.create_table(
        "utm_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("source", sa.String(255), nullable=False),
        sa.Column("medium", sa.String(255), nullable=False),
        sa.Column("campaign", sa.String(255), nullable=False),
        sa.Column("content", sa.String(255), nullable=True),
        sa.Column("term", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── New columns on seo_page_meta ────────────────────────────────────────
    op.add_column("seo_page_meta", sa.Column("schema_org_json", sa.Text, nullable=True))
    op.add_column("seo_page_meta", sa.Column("faq_json", sa.Text, nullable=True))

    # ── New columns on pages ─────────────────────────────────────────────────
    op.add_column("pages", sa.Column("redirect_chain", sa.JSON, nullable=True))
    op.add_column("pages", sa.Column("cwv_lcp", sa.Float, nullable=True))
    op.add_column("pages", sa.Column("cwv_cls", sa.Float, nullable=True))
    op.add_column("pages", sa.Column("cwv_fid", sa.Float, nullable=True))


def downgrade() -> None:
    op.drop_column("pages", "cwv_fid")
    op.drop_column("pages", "cwv_cls")
    op.drop_column("pages", "cwv_lcp")
    op.drop_column("pages", "redirect_chain")

    op.drop_column("seo_page_meta", "faq_json")
    op.drop_column("seo_page_meta", "schema_org_json")

    op.drop_index("ix_project_access_tokens_token", "project_access_tokens")
    op.drop_table("utm_templates")
    op.drop_table("project_access_tokens")
    op.drop_table("seo_meta_history")

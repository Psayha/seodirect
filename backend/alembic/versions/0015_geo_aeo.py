"""GEO/AEO tables: geo_keywords, geo_scan_results, ai_readiness_audits + new task types."""

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    # Extend TaskType enum
    op.execute("ALTER TYPE tasktype ADD VALUE IF NOT EXISTS 'geo_scan'")
    op.execute("ALTER TYPE tasktype ADD VALUE IF NOT EXISTS 'geo_audit'")

    # geo_keywords
    op.create_table(
        "geo_keywords",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("keyword", sa.String(500), nullable=False),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_geo_keywords_project_id", "geo_keywords", ["project_id"])

    # geo_scan_results
    op.create_table(
        "geo_scan_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "keyword_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("geo_keywords.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ai_model", sa.String(120), nullable=False),
        sa.Column("mentioned", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("mention_position", sa.String(20), nullable=True),
        sa.Column("sentiment", sa.String(20), nullable=True),
        sa.Column("sources_json", postgresql.JSONB, nullable=True),
        sa.Column("competitor_domains_json", postgresql.JSONB, nullable=True),
        sa.Column("response_snippet", sa.Text, nullable=True),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_geo_scan_results_project_id", "geo_scan_results", ["project_id"])
    op.create_index("ix_geo_scan_results_keyword_id", "geo_scan_results", ["keyword_id"])
    op.create_index("ix_geo_scan_results_scanned_at", "geo_scan_results", ["scanned_at"])

    # ai_readiness_audits
    op.create_table(
        "ai_readiness_audits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("blocked_bots_json", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("cloudflare_detected", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("has_llms_txt", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("llms_txt_content", sa.Text, nullable=True),
        sa.Column("has_about_page", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("has_author_page", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("pages_freshness_json", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("ai_readiness_score", sa.Integer, nullable=False, server_default="0"),
        sa.Column("audit_json", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ai_readiness_audits_project_id", "ai_readiness_audits", ["project_id"])
    op.create_index("ix_ai_readiness_audits_created_at", "ai_readiness_audits", ["created_at"])


def downgrade() -> None:
    op.drop_table("ai_readiness_audits")
    op.drop_table("geo_scan_results")
    op.drop_table("geo_keywords")

"""Add marketing semantic tables

Revision ID: 0014
Revises: 0013
Create Date: 2026-03-20
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── semantic_projects ──────────────────────────────────────────────────────
    op.create_table(
        "semantic_projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("mode", sa.String(10), nullable=False),
        sa.Column("region", sa.String(100), nullable=True),
        sa.Column("region_id", sa.Integer(), nullable=True),
        sa.Column("is_seasonal", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("brand_check_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("needs_brand_check", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("pipeline_step", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "mode", name="uq_semantic_project_mode"),
    )
    op.create_index("ix_semantic_projects_project_id", "semantic_projects", ["project_id"])

    # ── semantic_keywords ──────────────────────────────────────────────────────
    op.create_table(
        "semantic_keywords",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("semantic_project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("phrase", sa.String(512), nullable=False),
        sa.Column("frequency_base", sa.Integer(), nullable=True),
        sa.Column("frequency_phrase", sa.Integer(), nullable=True),
        sa.Column("frequency_exact", sa.Integer(), nullable=True),
        sa.Column("frequency_order", sa.Integer(), nullable=True),
        sa.Column("kw_type", sa.String(10), nullable=True),
        sa.Column("intent", sa.String(50), nullable=True),
        sa.Column("source", sa.String(50), nullable=False, server_default="wordstat"),
        sa.Column("geo_dependent", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_branded", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_seasonal", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_competitor", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_excluded", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("excluded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cluster_name", sa.String(255), nullable=True),
        sa.Column("monthly_dynamics", sa.JSON(), nullable=True),
        sa.Column("is_mask", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("mask_selected", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["semantic_project_id"], ["semantic_projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_semantic_keywords_project_id", "semantic_keywords", ["semantic_project_id"])

    # ── keyword_cache ──────────────────────────────────────────────────────────
    op.create_table(
        "keyword_cache",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("phrase", sa.String(512), nullable=False),
        sa.Column("region_id", sa.Integer(), nullable=True),
        sa.Column("frequency_base", sa.Integer(), nullable=True),
        sa.Column("frequency_phrase", sa.Integer(), nullable=True),
        sa.Column("frequency_exact", sa.Integer(), nullable=True),
        sa.Column("frequency_order", sa.Integer(), nullable=True),
        sa.Column("monthly_dynamics", sa.JSON(), nullable=True),
        sa.Column("cached_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_keyword_cache_phrase", "keyword_cache", ["phrase"])

    # ── cleaning_snapshots ─────────────────────────────────────────────────────
    op.create_table(
        "cleaning_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("semantic_project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("description", sa.String(255), nullable=False, server_default="авто-очистка"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["semantic_project_id"], ["semantic_projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cleaning_snapshots_project_id", "cleaning_snapshots", ["semantic_project_id"])

    # ── semantic_clusters ──────────────────────────────────────────────────────
    op.create_table(
        "semantic_clusters",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("semantic_project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("intent", sa.String(50), nullable=True),
        sa.Column("priority", sa.String(20), nullable=True),
        sa.Column("campaign_type", sa.String(50), nullable=True),
        sa.Column("related_cluster_ids", sa.JSON(), nullable=True),
        sa.Column("suggested_title", sa.String(35), nullable=True),
        sa.Column("suggested_description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["semantic_project_id"], ["semantic_projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_semantic_clusters_project_id", "semantic_clusters", ["semantic_project_id"])

    # ── marketing_minus_words ──────────────────────────────────────────────────
    op.create_table(
        "marketing_minus_words",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("semantic_project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("word", sa.String(255), nullable=False),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["semantic_project_id"], ["semantic_projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_marketing_minus_words_project_id", "marketing_minus_words", ["semantic_project_id"])


def downgrade() -> None:
    op.drop_table("marketing_minus_words")
    op.drop_table("semantic_clusters")
    op.drop_table("cleaning_snapshots")
    op.drop_table("keyword_cache")
    op.drop_table("semantic_keywords")
    op.drop_table("semantic_projects")

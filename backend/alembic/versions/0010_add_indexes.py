"""Add missing indexes on foreign keys and filtered columns

Revision ID: 0010
Revises: 0009
Create Date: 2026-03-18
"""
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # pages
    op.create_index("ix_pages_crawl_session_id", "pages", ["crawl_session_id"])
    op.create_index("ix_pages_status_code", "pages", ["status_code"])
    # campaigns
    op.create_index("ix_campaigns_project_id", "campaigns", ["project_id"])
    op.create_index("ix_campaigns_status", "campaigns", ["status"])
    # ad_groups
    op.create_index("ix_ad_groups_campaign_id", "ad_groups", ["campaign_id"])
    # keywords
    op.create_index("ix_keywords_ad_group_id", "keywords", ["ad_group_id"])
    op.create_index("ix_keywords_status", "keywords", ["status"])
    op.create_index("ix_keywords_temperature", "keywords", ["temperature"])
    # ads
    op.create_index("ix_ads_ad_group_id", "ads", ["ad_group_id"])
    op.create_index("ix_ads_status", "ads", ["status"])
    # crawl_sessions
    op.create_index("ix_crawl_sessions_project_id", "crawl_sessions", ["project_id"])
    op.create_index("ix_crawl_sessions_status", "crawl_sessions", ["status"])
    # negative_keywords
    op.create_index("ix_negative_keywords_project_id", "negative_keywords", ["project_id"])
    op.create_index("ix_negative_keywords_campaign_id", "negative_keywords", ["campaign_id"])
    # seo_page_meta
    op.create_index("ix_seo_page_meta_project_id", "seo_page_meta", ["project_id"])
    op.create_index("ix_seo_page_meta_page_url", "seo_page_meta", ["page_url"])
    # seo_meta_history
    op.create_index("ix_seo_meta_history_project_id", "seo_meta_history", ["project_id"])
    op.create_index("ix_seo_meta_history_page_url", "seo_meta_history", ["page_url"])
    # project_access_tokens
    op.create_index("ix_project_access_tokens_project_id", "project_access_tokens", ["project_id"])
    # project_events
    op.create_index("ix_project_events_project_id", "project_events", ["project_id"])
    op.create_index("ix_project_events_created_at", "project_events", ["created_at"])
    # content_plan_articles
    op.create_index("ix_content_plan_articles_project_id", "content_plan_articles", ["project_id"])
    # utm_templates
    op.create_index("ix_utm_templates_project_id", "utm_templates", ["project_id"])
    # tasks
    op.create_index("ix_tasks_project_id", "tasks", ["project_id"])
    op.create_index("ix_tasks_status", "tasks", ["status"])


def downgrade() -> None:
    op.drop_index("ix_pages_crawl_session_id", "pages")
    op.drop_index("ix_pages_status_code", "pages")
    op.drop_index("ix_campaigns_project_id", "campaigns")
    op.drop_index("ix_campaigns_status", "campaigns")
    op.drop_index("ix_ad_groups_campaign_id", "ad_groups")
    op.drop_index("ix_keywords_ad_group_id", "keywords")
    op.drop_index("ix_keywords_status", "keywords")
    op.drop_index("ix_keywords_temperature", "keywords")
    op.drop_index("ix_ads_ad_group_id", "ads")
    op.drop_index("ix_ads_status", "ads")
    op.drop_index("ix_crawl_sessions_project_id", "crawl_sessions")
    op.drop_index("ix_crawl_sessions_status", "crawl_sessions")
    op.drop_index("ix_negative_keywords_project_id", "negative_keywords")
    op.drop_index("ix_negative_keywords_campaign_id", "negative_keywords")
    op.drop_index("ix_seo_page_meta_project_id", "seo_page_meta")
    op.drop_index("ix_seo_page_meta_page_url", "seo_page_meta")
    op.drop_index("ix_seo_meta_history_project_id", "seo_meta_history")
    op.drop_index("ix_seo_meta_history_page_url", "seo_meta_history")
    op.drop_index("ix_project_access_tokens_project_id", "project_access_tokens")
    op.drop_index("ix_project_events_project_id", "project_events")
    op.drop_index("ix_project_events_created_at", "project_events")
    op.drop_index("ix_content_plan_articles_project_id", "content_plan_articles")
    op.drop_index("ix_utm_templates_project_id", "utm_templates")
    op.drop_index("ix_tasks_project_id", "tasks")
    op.drop_index("ix_tasks_status", "tasks")

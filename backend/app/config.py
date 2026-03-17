from functools import lru_cache
from pydantic import AnyUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = Field(default="development", alias="APP_ENV")
    app_host: str = Field(default="0.0.0.0", alias="APP_HOST")
    app_port: int = Field(default=8000, alias="APP_PORT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    frontend_url: str = Field(default="http://localhost:5173", alias="FRONTEND_URL")

    database_url: AnyUrl = Field(alias="DATABASE_URL")
    redis_url: AnyUrl = Field(alias="REDIS_URL")

    secret_key: str = Field(alias="SECRET_KEY")
    encryption_key: str = Field(alias="ENCRYPTION_KEY")

    super_admin_login: str = Field(alias="SUPER_ADMIN_LOGIN")
    super_admin_password_hash: str = Field(alias="SUPER_ADMIN_PASSWORD_HASH")
    super_admin_email: str = Field(alias="SUPER_ADMIN_EMAIL")

    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_minutes: int = Field(default=15, alias="ACCESS_TOKEN_MINUTES")
    refresh_token_days: int = Field(default=30, alias="REFRESH_TOKEN_DAYS")
    refresh_token_remember_days: int = Field(default=90, alias="REFRESH_TOKEN_REMEMBER_DAYS")
    login_rate_limit_attempts: int = Field(default=5, alias="LOGIN_RATE_LIMIT_ATTEMPTS")
    login_rate_limit_window_seconds: int = Field(default=900, alias="LOGIN_RATE_LIMIT_WINDOW_SECONDS")
    crawl_delay_ms_default: int = Field(default=1000, alias="CRAWL_DELAY_MS_DEFAULT")
    crawl_timeout_seconds: int = Field(default=10, alias="CRAWL_TIMEOUT_SECONDS")
    crawl_max_pages: int = Field(default=500, alias="CRAWL_MAX_PAGES")
    crawl_user_agent: str = Field(default="SEODirectBot/1.0 (internal)", alias="CRAWL_USER_AGENT")
    crawl_respect_robots: bool = Field(default=True, alias="CRAWL_RESPECT_ROBOTS")



@lru_cache
def get_settings() -> Settings:
    return Settings()

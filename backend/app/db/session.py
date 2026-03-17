from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from app.config import get_settings


def _get_engine():
    settings = get_settings()
    return create_engine(
        str(settings.database_url),
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
    )


engine = _get_engine()
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

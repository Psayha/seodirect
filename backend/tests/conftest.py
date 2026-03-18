"""Pytest configuration and shared fixtures."""
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Use in-memory SQLite for tests (no external DB needed)
SQLALCHEMY_TEST_URL = "sqlite:///:memory:"

os.environ.setdefault("DATABASE_URL", SQLALCHEMY_TEST_URL)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SECRET_KEY", "testsecretkey-must-be-at-least-32-chars-long")
os.environ.setdefault("ENCRYPTION_KEY", "testencrkey32charslong1234567890")
os.environ.setdefault("SUPER_ADMIN_LOGIN", "admin")
os.environ.setdefault("SUPER_ADMIN_PASSWORD_HASH", "$2b$12$placeholder")
os.environ.setdefault("SUPER_ADMIN_EMAIL", "admin@test.local")


@pytest.fixture(scope="session")
def engine():
    from app.db.session import Base
    eng = create_engine(
        SQLALCHEMY_TEST_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)


@pytest.fixture
def db(engine):
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def client(db):
    from app.main import app
    from app.db.session import get_db

    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

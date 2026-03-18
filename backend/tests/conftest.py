"""Pytest configuration and shared fixtures."""
import os
import uuid

# Set env vars BEFORE any app imports so settings validation passes
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SECRET_KEY", "testsecretkey-must-be-at-least-32-chars-long")
os.environ.setdefault("ENCRYPTION_KEY", "testencrkey32charslong1234567890")
os.environ.setdefault("SUPER_ADMIN_LOGIN", "admin")
os.environ.setdefault("SUPER_ADMIN_PASSWORD_HASH", "$2b$12$LJ3m4ys3Lg7RHwOFBSBLyOPkBiSfMNkOMarCb/JxFPDMj3ByurDAu")
os.environ.setdefault("SUPER_ADMIN_EMAIL", "admin@test.local")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture(scope="session")
def engine():
    from app.db.base import Base
    import app.models  # noqa: F401 — import all models to register them

    db_url = os.environ["DATABASE_URL"]
    eng = create_engine(db_url)
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)
    eng.dispose()


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


# ── Auth helpers ─────────────────────────────────────────────────────────────


@pytest.fixture
def admin_user(db):
    """Create an admin user and return it."""
    from app.auth.security import hash_password
    from app.models.user import User, UserRole

    user = User(
        id=uuid.uuid4(),
        login=f"admin_{uuid.uuid4().hex[:8]}",
        email=f"admin_{uuid.uuid4().hex[:8]}@test.local",
        password_hash=hash_password("testpassword123"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def specialist_user(db):
    """Create a specialist user and return it."""
    from app.auth.security import hash_password
    from app.models.user import User, UserRole

    user = User(
        id=uuid.uuid4(),
        login=f"spec_{uuid.uuid4().hex[:8]}",
        email=f"spec_{uuid.uuid4().hex[:8]}@test.local",
        password_hash=hash_password("testpassword123"),
        role=UserRole.SPECIALIST,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def viewer_user(db):
    """Create a viewer user and return it."""
    from app.auth.security import hash_password
    from app.models.user import User, UserRole

    user = User(
        id=uuid.uuid4(),
        login=f"viewer_{uuid.uuid4().hex[:8]}",
        email=f"viewer_{uuid.uuid4().hex[:8]}@test.local",
        password_hash=hash_password("testpassword123"),
        role=UserRole.VIEWER,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def _make_token(user):
    """Helper to create an access token for a user."""
    from app.auth.security import create_access_token
    return create_access_token(str(user.id), user.role.value)


def _auth_header(user):
    """Return Authorization header dict for a user."""
    return {"Authorization": f"Bearer {_make_token(user)}"}


@pytest.fixture
def admin_headers(admin_user):
    return _auth_header(admin_user)


@pytest.fixture
def specialist_headers(specialist_user):
    return _auth_header(specialist_user)


@pytest.fixture
def viewer_headers(viewer_user):
    return _auth_header(viewer_user)


@pytest.fixture
def project(db, specialist_user):
    """Create a test project assigned to the specialist."""
    from app.models.project import Project, ProjectStatus

    p = Project(
        id=uuid.uuid4(),
        name="Test Project",
        client_name="Test Client",
        url="https://example.com",
        specialist_id=specialist_user.id,
        status=ProjectStatus.ACTIVE,
    )
    db.add(p)
    db.flush()
    return p

"""Tests for projects endpoints — CRUD, access control, soft delete."""
import uuid


# ── Auth required ────────────────────────────────────────────────────────────


def test_list_projects_requires_auth(client):
    resp = client.get("/api/projects")
    assert resp.status_code == 401


def test_create_project_requires_auth(client):
    resp = client.post("/api/projects", json={"name": "Test", "url": "https://example.com"})
    assert resp.status_code == 401


def test_get_nonexistent_project_requires_auth(client):
    resp = client.get("/api/projects/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 401


# ── CRUD ────────────────────────────────────────────────────────────────────


def test_create_project(client, specialist_headers):
    resp = client.post(
        "/api/projects",
        json={"name": "New Project", "client_name": "Client", "url": "https://example.com"},
        headers=specialist_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "New Project"
    assert data["status"] == "active"


def test_list_projects(client, specialist_headers, project):
    resp = client.get("/api/projects", headers=specialist_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert any(p["name"] == "Test Project" for p in data)


def test_get_project(client, specialist_headers, project):
    resp = client.get(f"/api/projects/{project.id}", headers=specialist_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Test Project"


def test_update_project(client, specialist_headers, project):
    resp = client.patch(
        f"/api/projects/{project.id}",
        json={"name": "Updated Name"},
        headers=specialist_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


def test_get_nonexistent_project(client, specialist_headers):
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = client.get(f"/api/projects/{fake_id}", headers=specialist_headers)
    assert resp.status_code == 404


# ── Viewer cannot write ──────────────────────────────────────────────────────


def test_viewer_cannot_create_project(client, viewer_headers):
    resp = client.post(
        "/api/projects",
        json={"name": "Viewer Project", "client_name": "C", "url": "https://example.com"},
        headers=viewer_headers,
    )
    assert resp.status_code == 403


# ── Specialist isolation ─────────────────────────────────────────────────────


def test_specialist_cannot_access_other_project(client, db, project):
    """A different specialist cannot see another specialist's project."""
    from app.auth.security import hash_password, create_access_token
    from app.models.user import User, UserRole

    other = User(
        id=uuid.uuid4(),
        login=f"other_{uuid.uuid4().hex[:8]}",
        email=f"other_{uuid.uuid4().hex[:8]}@test.local",
        password_hash=hash_password("testpassword123"),
        role=UserRole.SPECIALIST,
        is_active=True,
    )
    db.add(other)
    db.flush()

    headers = {"Authorization": f"Bearer {create_access_token(str(other.id), other.role.value)}"}
    resp = client.get(f"/api/projects/{project.id}", headers=headers)
    assert resp.status_code == 403


# ── Soft delete ──────────────────────────────────────────────────────────────


def test_delete_project_soft_delete(client, admin_headers, project):
    """DELETE should soft-delete the project (set deleted_at), not physically remove it."""
    resp = client.delete(f"/api/projects/{project.id}", headers=admin_headers)
    assert resp.status_code == 204

    # Project should no longer appear in list
    resp = client.get("/api/projects", headers=admin_headers)
    ids = [p["id"] for p in resp.json()]
    assert str(project.id) not in ids


def test_delete_project_requires_admin(client, specialist_headers, project):
    resp = client.delete(f"/api/projects/{project.id}", headers=specialist_headers)
    assert resp.status_code == 403


def test_deleted_project_returns_404(client, db, admin_headers, project):
    """A soft-deleted project should return 404 on GET."""
    from datetime import datetime, timezone
    project.deleted_at = datetime.now(timezone.utc)
    db.flush()

    resp = client.get(f"/api/projects/{project.id}", headers=admin_headers)
    assert resp.status_code == 404


# ── URL validation ───────────────────────────────────────────────────────────


def test_create_project_rejects_localhost_url(client, specialist_headers):
    resp = client.post(
        "/api/projects",
        json={"name": "Bad URL", "client_name": "C", "url": "http://localhost:8080"},
        headers=specialist_headers,
    )
    assert resp.status_code == 422


def test_create_project_rejects_no_scheme(client, specialist_headers):
    resp = client.post(
        "/api/projects",
        json={"name": "Bad URL", "client_name": "C", "url": "ftp://example.com"},
        headers=specialist_headers,
    )
    assert resp.status_code == 422

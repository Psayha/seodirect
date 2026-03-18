"""Tests for projects endpoints — unauthenticated access."""


def test_list_projects_requires_auth(client):
    resp = client.get("/api/projects")
    assert resp.status_code == 401


def test_create_project_requires_auth(client):
    resp = client.post("/api/projects", json={"name": "Test", "url": "https://example.com"})
    assert resp.status_code == 401


def test_get_nonexistent_project_requires_auth(client):
    resp = client.get("/api/projects/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 401

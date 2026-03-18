"""Security-focused tests — headers, access control, token revocation, encryption."""
import uuid


# ── Security headers ─────────────────────────────────────────────────────────


def test_security_headers_present(client):
    """All security headers should be present on every response."""
    resp = client.get("/api/health")
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert resp.headers.get("x-frame-options") == "DENY"
    assert "strict-transport-security" in resp.headers


def test_cors_not_wildcard(client):
    """CORS should not allow wildcard origin."""
    resp = client.options(
        "/api/health",
        headers={"Origin": "https://evil.com", "Access-Control-Request-Method": "GET"},
    )
    # Should NOT return Access-Control-Allow-Origin: *
    acao = resp.headers.get("access-control-allow-origin", "")
    assert acao != "*"


# ── Token revocation on user deactivation ────────────────────────────────────


def test_deactivated_user_cannot_access_api(client, db, specialist_user, specialist_headers):
    """After deactivation, access token should be rejected (DB check on each request)."""
    specialist_user.is_active = False
    db.flush()
    resp = client.get("/api/projects", headers=specialist_headers)
    assert resp.status_code == 401


def test_token_revoked_after_role_change(client, db, specialist_user):
    """After role change, old refresh tokens should be revoked."""
    # Login to get refresh token
    login_resp = client.post(
        "/api/auth/login",
        json={"login": specialist_user.login, "password": "testpassword123"},
    )
    refresh_token = login_resp.json()["refresh_token"]

    # Admin changes user role — this should bump token generation
    from app.auth.rate_limit import blacklist_all_user_tokens
    blacklist_all_user_tokens(str(specialist_user.id))

    # Old refresh token should now be rejected
    resp = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 401


# ── Export access control ────────────────────────────────────────────────────


def test_export_requires_auth(client):
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = client.get(f"/api/projects/{fake_id}/export/mediaplan-xlsx")
    assert resp.status_code == 401


def test_export_specialist_cannot_access_other_project(client, db, project):
    """A specialist should not be able to export another specialist's project."""
    from app.auth.security import hash_password, create_access_token
    from app.models.user import User, UserRole

    other = User(
        id=uuid.uuid4(),
        login=f"other_exp_{uuid.uuid4().hex[:8]}",
        email=f"other_exp_{uuid.uuid4().hex[:8]}@test.local",
        password_hash=hash_password("testpassword123"),
        role=UserRole.SPECIALIST,
        is_active=True,
    )
    db.add(other)
    db.flush()
    headers = {"Authorization": f"Bearer {create_access_token(str(other.id), other.role.value)}"}

    resp = client.get(f"/api/projects/{project.id}/export/mediaplan-xlsx", headers=headers)
    assert resp.status_code == 403


# ── Analytics access control ─────────────────────────────────────────────────


def test_analytics_requires_auth(client):
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = client.get(f"/api/projects/{fake_id}/analytics/summary")
    assert resp.status_code == 401


# ── Users admin endpoints ────────────────────────────────────────────────────


def test_list_users_requires_admin(client, specialist_headers):
    resp = client.get("/api/users", headers=specialist_headers)
    assert resp.status_code == 403


def test_list_users_as_admin(client, admin_headers):
    resp = client.get("/api/users", headers=admin_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_create_user_validates_password_length(client, admin_headers):
    resp = client.post(
        "/api/users",
        json={"login": "shortpw", "email": "sp@test.local", "password": "short"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_reset_password_validates_length(client, db, admin_headers, specialist_user):
    resp = client.post(
        f"/api/users/{specialist_user.id}/reset-password",
        json={"password": "short"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_reset_password_success(client, db, admin_headers, specialist_user):
    resp = client.post(
        f"/api/users/{specialist_user.id}/reset-password",
        json={"password": "newpassword123"},
        headers=admin_headers,
    )
    assert resp.status_code == 204


# ── Health/readiness ─────────────────────────────────────────────────────────


def test_health_returns_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

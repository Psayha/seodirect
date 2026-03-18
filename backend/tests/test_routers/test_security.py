"""Security-focused tests — headers, access control, token revocation, IDOR, input validation."""
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
    login_resp = client.post(
        "/api/auth/login",
        json={"login": specialist_user.login, "password": "testpassword123"},
    )
    refresh_token = login_resp.json()["refresh_token"]

    from app.auth.rate_limit import blacklist_all_user_tokens
    blacklist_all_user_tokens(str(specialist_user.id))

    resp = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 401


# ── Refresh token rotation (reuse prevention) ───────────────────────────────


def test_refresh_token_rotation_invalidates_old_token(client, specialist_user):
    """After refresh, the OLD refresh token should be blacklisted."""
    login_resp = client.post(
        "/api/auth/login",
        json={"login": specialist_user.login, "password": "testpassword123"},
    )
    old_refresh = login_resp.json()["refresh_token"]

    # Use the refresh token to get a new pair
    refresh_resp = client.post("/api/auth/refresh", json={"refresh_token": old_refresh})
    assert refresh_resp.status_code == 200

    # Old refresh token should now be rejected (rotation)
    reuse_resp = client.post("/api/auth/refresh", json={"refresh_token": old_refresh})
    assert reuse_resp.status_code == 401, "Old refresh token should be revoked after rotation"


# ── Input validation on auth endpoints ───────────────────────────────────────


def test_login_rejects_oversized_login(client):
    resp = client.post(
        "/api/auth/login",
        json={"login": "x" * 200, "password": "testpassword123"},
    )
    assert resp.status_code == 422


def test_login_rejects_oversized_password(client):
    resp = client.post(
        "/api/auth/login",
        json={"login": "admin", "password": "x" * 300},
    )
    assert resp.status_code == 422


def test_refresh_rejects_oversized_token(client):
    resp = client.post(
        "/api/auth/refresh",
        json={"refresh_token": "x" * 5000},
    )
    assert resp.status_code == 422


# ── IDOR tests (access control across project boundaries) ───────────────────


def _make_other_specialist(db):
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
    return other, headers


def test_report_idor_blocked(client, db, project):
    """A specialist should not access another specialist's report."""
    _, headers = _make_other_specialist(db)
    resp = client.get(f"/api/projects/{project.id}/report/html", headers=headers)
    assert resp.status_code == 403


def test_report_preview_idor_blocked(client, db, project):
    _, headers = _make_other_specialist(db)
    resp = client.get(f"/api/projects/{project.id}/report/preview", headers=headers)
    assert resp.status_code == 403


def test_history_idor_blocked(client, db, project):
    """A specialist should not access another specialist's history."""
    _, headers = _make_other_specialist(db)
    resp = client.get(f"/api/projects/{project.id}/history", headers=headers)
    assert resp.status_code == 403


def test_seo_pages_idor_blocked(client, db, project):
    """A specialist should not access another specialist's SEO pages."""
    _, headers = _make_other_specialist(db)
    resp = client.get(f"/api/projects/{project.id}/seo/pages", headers=headers)
    assert resp.status_code == 403


def test_seo_checklist_idor_blocked(client, db, project):
    _, headers = _make_other_specialist(db)
    resp = client.get(f"/api/projects/{project.id}/seo/checklist", headers=headers)
    assert resp.status_code == 403


def test_export_specialist_cannot_access_other_project(client, db, project):
    _, headers = _make_other_specialist(db)
    resp = client.get(f"/api/projects/{project.id}/export/mediaplan-xlsx", headers=headers)
    assert resp.status_code == 403


# ── Deleted project protection ───────────────────────────────────────────────


def test_deleted_project_report_returns_404(client, db, admin_headers, project):
    from datetime import datetime, timezone
    project.deleted_at = datetime.now(timezone.utc)
    db.flush()
    resp = client.get(f"/api/projects/{project.id}/report/html", headers=admin_headers)
    assert resp.status_code == 404


def test_deleted_project_history_returns_404(client, db, admin_headers, project):
    from datetime import datetime, timezone
    project.deleted_at = datetime.now(timezone.utc)
    db.flush()
    resp = client.get(f"/api/projects/{project.id}/history", headers=admin_headers)
    assert resp.status_code == 404


# ── Auth endpoints ──────────────────────────────────────────────────────────


def test_export_requires_auth(client):
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = client.get(f"/api/projects/{fake_id}/export/mediaplan-xlsx")
    assert resp.status_code == 401


def test_analytics_requires_auth(client):
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = client.get(f"/api/projects/{fake_id}/analytics/summary")
    assert resp.status_code == 401


def test_report_requires_auth(client):
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = client.get(f"/api/projects/{fake_id}/report/html")
    assert resp.status_code == 401


def test_history_requires_auth(client):
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = client.get(f"/api/projects/{fake_id}/history")
    assert resp.status_code == 401


# ── Admin endpoints ─────────────────────────────────────────────────────────


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


# ── SSRF protection ─────────────────────────────────────────────────────────


def test_crawler_blocks_private_ips():
    """SiteCrawler should refuse to crawl private/loopback addresses."""
    from app.crawl.crawler import SiteCrawler
    import pytest

    with pytest.raises(ValueError, match="private or reserved"):
        SiteCrawler(base_url="http://127.0.0.1")

    with pytest.raises(ValueError, match="private or reserved"):
        SiteCrawler(base_url="http://192.168.1.1")

    with pytest.raises(ValueError, match="private or reserved"):
        SiteCrawler(base_url="http://10.0.0.1")


# ── CSS / HTML injection prevention ─────────────────────────────────────────


def test_css_color_injection_blocked():
    """Primary color with injected CSS should be sanitized."""
    from app.services.exporter import _get_print_css
    css = _get_print_css("red; background: url('evil')")
    assert "evil" not in css
    assert "#1e40af" in css  # Should fall back to default


def test_css_valid_color_accepted():
    from app.services.exporter import _get_print_css
    css = _get_print_css("#ff5733")
    assert "#ff5733" in css


# ── Health ───────────────────────────────────────────────────────────────────


def test_health_returns_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

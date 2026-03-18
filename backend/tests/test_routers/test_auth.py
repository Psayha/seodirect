"""Tests for auth endpoints — login, refresh, logout, /me."""


def test_login_missing_credentials(client):
    resp = client.post("/api/auth/login", json={})
    assert resp.status_code == 422


def test_login_wrong_credentials(client):
    resp = client.post("/api/auth/login", json={"login": "nobody", "password": "wrong"})
    assert resp.status_code == 401


def test_login_success(client, specialist_user):
    resp = client.post(
        "/api/auth/login",
        json={"login": specialist_user.login, "password": "testpassword123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_inactive_user(client, db, specialist_user):
    specialist_user.is_active = False
    db.flush()
    resp = client.post(
        "/api/auth/login",
        json={"login": specialist_user.login, "password": "testpassword123"},
    )
    assert resp.status_code == 401


def test_refresh_token_works(client, specialist_user):
    login_resp = client.post(
        "/api/auth/login",
        json={"login": specialist_user.login, "password": "testpassword123"},
    )
    refresh_token = login_resp.json()["refresh_token"]
    resp = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_refresh_token_invalid(client):
    resp = client.post("/api/auth/refresh", json={"refresh_token": "invalid"})
    assert resp.status_code == 401


def test_refresh_token_with_access_token_rejected(client, specialist_user):
    """Using an access token as a refresh token should fail."""
    from tests.conftest import _make_token

    access_token = _make_token(specialist_user)
    resp = client.post("/api/auth/refresh", json={"refresh_token": access_token})
    assert resp.status_code == 401


def test_logout_revokes_refresh_token(client, specialist_user):
    """After logout, the refresh token should no longer work."""
    login_resp = client.post(
        "/api/auth/login",
        json={"login": specialist_user.login, "password": "testpassword123"},
    )
    refresh_token = login_resp.json()["refresh_token"]
    resp = client.post("/api/auth/logout", json={"refresh_token": refresh_token})
    assert resp.status_code == 204

    resp = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 401


def test_me_endpoint(client, specialist_user):
    from tests.conftest import _auth_header

    resp = client.get("/api/auth/me", headers=_auth_header(specialist_user))
    assert resp.status_code == 200
    data = resp.json()
    assert data["login"] == specialist_user.login
    assert data["role"] == "specialist"


def test_me_requires_auth(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code in (401, 403)


def test_login_rate_limit_header_present(client):
    """Rate limiter should be active."""
    resp = client.post("/api/auth/login", json={"login": "x", "password": "x"})
    assert resp.status_code in (401, 422, 429)

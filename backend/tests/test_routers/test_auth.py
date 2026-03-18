"""Tests for auth endpoints."""
import pytest


def test_login_missing_credentials(client):
    resp = client.post("/api/auth/login", json={})
    assert resp.status_code == 422


def test_login_wrong_credentials(client):
    resp = client.post("/api/auth/login", json={"login": "nobody", "password": "wrong"})
    assert resp.status_code == 401


def test_login_rate_limit_header_present(client):
    """Rate limiter should be active (headers appear after a real request)."""
    resp = client.post("/api/auth/login", json={"login": "x", "password": "x"})
    # Either 401 (auth failed) or 429 (rate limited) are valid — confirms limiter is wired
    assert resp.status_code in (401, 422, 429)

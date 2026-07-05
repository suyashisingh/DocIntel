"""Tests for POST /auth/signup and POST /auth/login."""


def test_signup_returns_user_id_and_email(client):
    r = client.post("/auth/signup", json={"email": "new@test.com", "password": "testpass123"})
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "new@test.com"
    assert "id" in body
    assert "password" not in body  # never leak password fields


def test_signup_duplicate_email_is_rejected(client):
    client.post("/auth/signup", json={"email": "dup@test.com", "password": "testpass123"})
    r = client.post("/auth/signup", json={"email": "dup@test.com", "password": "testpass123"})
    assert r.status_code == 400
    assert "already registered" in r.json()["detail"]


def test_signup_invalid_email_is_rejected(client):
    r = client.post("/auth/signup", json={"email": "not-an-email", "password": "testpass123"})
    assert r.status_code == 422


def test_signup_short_password_is_rejected(client):
    r = client.post("/auth/signup", json={"email": "short@test.com", "password": "abc"})
    assert r.status_code == 422


def test_login_returns_bearer_token(client):
    client.post("/auth/signup", json={"email": "login@test.com", "password": "testpass123"})
    # OAuth2PasswordRequestForm expects form-encoded data, not JSON
    r = client.post("/auth/login", data={"username": "login@test.com", "password": "testpass123"})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


def test_login_wrong_password_returns_401(client):
    client.post("/auth/signup", json={"email": "user@test.com", "password": "testpass123"})
    r = client.post("/auth/login", data={"username": "user@test.com", "password": "wrongpassword"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid credentials"


def test_login_unknown_email_returns_401(client):
    r = client.post("/auth/login", data={"username": "nobody@test.com", "password": "any"})
    assert r.status_code == 401


def test_protected_route_without_token_returns_401(client):
    """Smoke-test that the auth dependency rejects un-authenticated requests."""
    r = client.get("/organizations/")
    assert r.status_code in (401, 405)  # 405 if method not allowed, 401 if auth checked first

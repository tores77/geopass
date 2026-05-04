"""Shared fixtures for GeoPass backend tests."""
import os
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path("/app/frontend/.env"))
load_dotenv(Path("/app/backend/.env"))

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SUPABASE_URL = os.environ["REACT_APP_SUPABASE_URL"].rstrip("/")
SUPABASE_ANON_KEY = os.environ["REACT_APP_SUPABASE_ANON_KEY"]

ADMIN_EMAIL = "pere@umanialabs.com"
ADMIN_PASSWORD = "123456Ab!!"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def supabase_token():
    """Authenticate with Supabase Auth and return the access_token JWT."""
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    r = requests.post(
        url,
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
        },
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=10,
    )
    if r.status_code != 200:
        pytest.skip(f"Supabase login failed: {r.status_code} {r.text}")
    data = r.json()
    return data["access_token"]


@pytest.fixture(scope="session")
def auth_headers(supabase_token):
    return {"Authorization": f"Bearer {supabase_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def registro_result(api_client, base_url):
    """Do a ONE-time public registration and share the response across tests.

    Railway pkpass creation adds ~1-2s + Supabase ~10s, so doing this once
    saves a lot of time vs per-test registrations.
    """
    import uuid as _uuid
    email = f"TEST_reg_{_uuid.uuid4().hex[:8]}@example.com"
    r = api_client.post(
        f"{base_url}/api/public/registro/umania-demo",
        json={"nombre": "TEST Publico", "email": email, "telefono": "+34611111111"},
        timeout=30,
    )
    assert r.status_code == 200, f"Registro failed: {r.status_code} {r.text}"
    return r.json()

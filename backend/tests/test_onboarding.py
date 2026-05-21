"""End-to-end tests for the public /api/public/onboarding endpoint.

Covers: happy path, slug generation, duplicate email, validation errors,
geocoding (real + bogus), explicit lat/lng override, /auth/me with newly
created credentials. Test data is cleaned up at the end of the module
via the Supabase service-role key (auth user + tenant + admin row).
"""

import os
import time
import uuid as _uuid
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path("/app/frontend/.env"))
load_dotenv(Path("/app/backend/.env"))

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_ANON = os.environ["REACT_APP_SUPABASE_ANON_KEY"]
SUPABASE_SERVICE = os.environ["SUPABASE_SERVICE_KEY"]

ONB = f"{BASE_URL}/api/public/onboarding"


# ─────────────────────────── helpers ───────────────────────────
def _ts():
    return f"{int(time.time() * 1000)}-{_uuid.uuid4().hex[:6]}"


def _service_headers():
    return {
        "apikey": SUPABASE_SERVICE,
        "Authorization": f"Bearer {SUPABASE_SERVICE}",
        "Content-Type": "application/json",
    }


# Track created entities so we can clean up at module teardown.
_CREATED = {"emails": set(), "tenant_ids": set(), "slugs": set()}


def _register(payload, expected_status=200):
    r = requests.post(ONB, json=payload, timeout=40)
    if r.status_code == 200 and expected_status == 200:
        body = r.json()
        _CREATED["emails"].add(payload["email"])
        _CREATED["tenant_ids"].add(body["tenant_id"])
        _CREATED["slugs"].add(body["tenant_slug"])
    return r


def _make_payload(**overrides):
    ts = _ts()
    base = {
        "nombre_marca": f"E2E Cafe {ts}",
        "tipo_negocio": "Cafetería",
        "nombre_programa": "Club de socios",
        "color_primario": "#00E5A0",
        "direccion": "Calle Mayor 12, Madrid",
        "email": f"e2e-{ts}@example.com",
        "password": "Test123!!",
    }
    base.update(overrides)
    return base


# ─────────────────────────── tests ───────────────────────────
class TestOnboardingHappyPath:
    """Onboarding creates auth user + tenant + admin row, returns slug."""

    def test_happy_path_creates_tenant(self):
        payload = _make_payload(nombre_marca="E2E Happy Path Cafe")
        r = _register(payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["success"] is True
        assert body["redirect_url"] == "/dashboard"
        assert body["tenant_slug"].startswith("e2e-happy-path-cafe")
        assert isinstance(body["tenant_id"], str) and len(body["tenant_id"]) >= 32

    def test_auth_me_after_onboarding(self):
        """After onboarding, the same credentials should log in and /auth/me
        returns the freshly created tenant — proves admin row + auth user
        link work end-to-end."""
        payload = _make_payload(nombre_marca="E2E AuthMe Cafe")
        r = _register(payload)
        assert r.status_code == 200, r.text
        body = r.json()

        # log in
        login = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={"apikey": SUPABASE_ANON, "Content-Type": "application/json"},
            json={"email": payload["email"], "password": payload["password"]},
            timeout=15,
        )
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]

        # /auth/me
        me = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert me.status_code == 200, me.text
        me_body = me.json()
        # tenant fields are nested under "tenant" key
        tenant = me_body.get("tenant") or me_body
        # Just check the tenant slug/id matches
        assert (
            tenant.get("slug") == body["tenant_slug"]
            or me_body.get("tenant", {}).get("slug") == body["tenant_slug"]
            or any(
                (v == body["tenant_slug"]) for v in _flatten(me_body)
            )
        ), f"tenant slug not found in /auth/me response: {me_body}"


def _flatten(obj):
    """Yield all string values in a nested dict/list."""
    if isinstance(obj, dict):
        for v in obj.values():
            yield from _flatten(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _flatten(v)
    elif isinstance(obj, str):
        yield obj


class TestOnboardingDuplicate:
    """Duplicate email returns 409 with Spanish message."""

    def test_duplicate_email_returns_409(self):
        payload = _make_payload(nombre_marca="E2E Dup Cafe")
        r1 = _register(payload)
        assert r1.status_code == 200, r1.text

        # second registration with the same email
        payload2 = _make_payload(email=payload["email"], nombre_marca="E2E Dup Cafe Two")
        r2 = requests.post(ONB, json=payload2, timeout=30)
        assert r2.status_code == 409, r2.text
        detail = r2.json().get("detail", "")
        assert "email" in detail.lower() or "cuenta" in detail.lower()


class TestOnboardingValidation:
    """422 on Pydantic validation errors."""

    def test_short_nombre_marca_returns_422(self):
        payload = _make_payload(nombre_marca="X")
        r = requests.post(ONB, json=payload, timeout=15)
        assert r.status_code == 422

    def test_missing_email_returns_422(self):
        payload = _make_payload()
        del payload["email"]
        r = requests.post(ONB, json=payload, timeout=15)
        assert r.status_code == 422

    def test_short_password_returns_422(self):
        payload = _make_payload(password="abc")
        r = requests.post(ONB, json=payload, timeout=15)
        assert r.status_code == 422


class TestOnboardingSlug:
    """Slug generation handles accents/Ñ/spaces and collisions."""

    def test_slug_accents_normalized(self):
        ts = _ts()
        payload = _make_payload(
            nombre_marca=f"Café Niño Sí {ts}",
        )
        r = _register(payload)
        assert r.status_code == 200, r.text
        slug = r.json()["tenant_slug"]
        # base slug should be cafe-nino-si-... (no accents, no Ñ)
        assert slug.startswith("cafe-nino-si"), f"unexpected slug: {slug}"
        # all chars ascii lowercase / digits / hyphen
        assert all(c.islower() or c.isdigit() or c == "-" for c in slug), slug

    def test_slug_collision_adds_suffix(self):
        """Same nombre_marca twice — second slug must differ from first."""
        marca = f"E2E Collision Cafe {_ts()}"
        p1 = _make_payload(nombre_marca=marca)
        r1 = _register(p1)
        assert r1.status_code == 200, r1.text
        slug1 = r1.json()["tenant_slug"]

        p2 = _make_payload(nombre_marca=marca)
        r2 = _register(p2)
        assert r2.status_code == 200, r2.text
        slug2 = r2.json()["tenant_slug"]
        assert slug2 != slug1, "slug collision was not handled — duplicate returned"
        # second one should start with the first and have a hex suffix
        assert slug2.startswith(slug1) or slug2.startswith(slug1.rsplit("-", 1)[0])


class TestOnboardingGeocoding:
    """Nominatim is best-effort: real address → coords, bogus → null."""

    def _fetch_tenant(self, tenant_id):
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/tenants?id=eq.{tenant_id}&select=lat,lng,direccion",
            headers=_service_headers(),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        assert rows, f"tenant {tenant_id} not found"
        return rows[0]

    def test_real_address_gets_geocoded(self):
        payload = _make_payload(
            nombre_marca="E2E Geo Cafe",
            direccion="Calle Mayor 12, Madrid",
        )
        r = _register(payload)
        assert r.status_code == 200, r.text
        # Nominatim can be slow / rate-limited; allow null but warn.
        row = self._fetch_tenant(r.json()["tenant_id"])
        if row["lat"] is None or row["lng"] is None:
            pytest.skip("Nominatim returned no coords (best-effort, external service).")
        assert 35 < row["lat"] < 45  # Madrid is ~40.4
        assert -10 < row["lng"] < 5   # Madrid is ~-3.7

    def test_bogus_address_still_creates_tenant(self):
        payload = _make_payload(
            nombre_marca="E2E Bogus Geo Cafe",
            direccion="xqzxqzxqz-not-a-real-place-zzz-12345",
        )
        r = _register(payload)
        assert r.status_code == 200, r.text
        row = self._fetch_tenant(r.json()["tenant_id"])
        # bogus address → null is the expected best-effort behaviour
        assert row["lat"] is None and row["lng"] is None

    def test_client_provided_latlng_wins_over_geocode(self):
        payload = _make_payload(
            nombre_marca="E2E LatLng Cafe",
            direccion="Calle Mayor 12, Madrid",  # would geocode to ~40.41, -3.70
            lat=41.3851,  # Barcelona
            lng=2.1734,
        )
        r = _register(payload)
        assert r.status_code == 200, r.text
        row = self._fetch_tenant(r.json()["tenant_id"])
        assert row["lat"] == pytest.approx(41.3851, abs=0.01)
        assert row["lng"] == pytest.approx(2.1734, abs=0.01)


# ─────────────────────────── cleanup ───────────────────────────
def _delete_auth_user_by_email(email):
    # find user
    r = requests.get(
        f"{SUPABASE_URL}/auth/v1/admin/users?filter=email.eq.{email}",
        headers=_service_headers(),
        timeout=15,
    )
    if r.status_code != 200:
        return
    users = r.json().get("users") or []
    for u in users:
        if u.get("email", "").lower() == email.lower():
            requests.delete(
                f"{SUPABASE_URL}/auth/v1/admin/users/{u['id']}",
                headers=_service_headers(),
                timeout=15,
            )


@pytest.fixture(scope="module", autouse=True)
def _cleanup_at_end():
    yield
    # Clean up admin rows + tenants + auth users created during the run.
    for tid in list(_CREATED["tenant_ids"]):
        try:
            requests.delete(
                f"{SUPABASE_URL}/rest/v1/usuarios_admin?tenant_id=eq.{tid}",
                headers=_service_headers(),
                timeout=15,
            )
            requests.delete(
                f"{SUPABASE_URL}/rest/v1/tenants?id=eq.{tid}",
                headers=_service_headers(),
                timeout=15,
            )
        except Exception:
            pass
    for email in list(_CREATED["emails"]):
        try:
            _delete_auth_user_by_email(email)
        except Exception:
            pass

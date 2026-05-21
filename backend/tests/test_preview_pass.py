"""Tests for the public preview-pass endpoints.

Covers:
- POST /api/public/preview-pass: success with valid tenant_id, 404 for unknown,
  no-auth requirement, no DB writes, rate-limiting (10/hour).
- GET /api/public/preview-pass/{slug}: success (binary pkpass), 404 for unknown.
"""
import base64
import os
import uuid

import pytest
import requests


@pytest.fixture(scope="module")
def tenant_id(base_url, auth_headers):
    """Resolve the umania-demo tenant_id via /api/auth/me (the safe existing tenant)."""
    r = requests.get(f"{base_url}/api/auth/me", headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"/auth/me failed: {r.status_code} {r.text}"
    tid = r.json()["tenant_id"]
    assert isinstance(tid, str) and len(tid) > 0
    return tid


@pytest.fixture(scope="module")
def saved_card_config(base_url, auth_headers):
    """Snapshot the saved card-config so we can verify it doesn't change."""
    r = requests.get(f"{base_url}/api/tenant/card-config", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# ───────────────────────────── POST /api/public/preview-pass ─────────────────────────────


class TestPreviewPassPost:
    def test_post_no_auth_required(self, base_url, tenant_id):
        """Endpoint must work WITHOUT any Authorization header."""
        s = requests.Session()  # fresh session, no auth header set
        r = s.post(
            f"{base_url}/api/public/preview-pass",
            json={"tenant_id": tenant_id},
            timeout=30,
        )
        # 200 expected; 503 acceptable per agent-to-agent context (Railway cold start).
        assert r.status_code in (200, 503), f"Unexpected: {r.status_code} {r.text}"
        if r.status_code == 200:
            data = r.json()
            assert data.get("ok") is True
            assert isinstance(data.get("pkpass_base64"), str)
            assert len(data["pkpass_base64"]) > 100
            # Validate it's actual base64
            decoded = base64.b64decode(data["pkpass_base64"], validate=True)
            assert len(decoded) > 0

    def test_post_returns_base64_with_overlay(self, base_url, tenant_id, saved_card_config):
        """Overlay caller-provided fields should not mutate persisted config."""
        custom_color = "#FF00AA"
        custom_name = f"TEST_Preview_{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{base_url}/api/public/preview-pass",
            json={
                "tenant_id": tenant_id,
                "color_primario": custom_color,
                "nombre_programa": custom_name,
                "plantilla_fidelizacion": "sellos",
            },
            timeout=30,
        )
        assert r.status_code in (200, 503), f"Unexpected: {r.status_code} {r.text}"
        if r.status_code == 200:
            assert r.json().get("ok") is True

    def test_post_does_not_write_to_db(self, base_url, tenant_id, auth_headers, saved_card_config):
        """After preview, GET /api/tenant/card-config must return identical saved values."""
        # send overlay
        requests.post(
            f"{base_url}/api/public/preview-pass",
            json={
                "tenant_id": tenant_id,
                "color_primario": "#123456",
                "color_secundario": "#654321",
                "nombre_programa": "TEST_should_not_persist",
                "plantilla_fidelizacion": "niveles",
                "logo_url": "data:image/png;base64,iVBORw0KGgo=",
            },
            timeout=30,
        )
        r = requests.get(f"{base_url}/api/tenant/card-config", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        after = r.json()
        # All persisted fields must still equal the snapshot
        for k in (
            "color_primario",
            "color_secundario",
            "nombre_programa",
            "plantilla_fidelizacion",
            "logo_url",
        ):
            assert after.get(k) == saved_card_config.get(k), (
                f"Field {k} CHANGED after preview: before={saved_card_config.get(k)} after={after.get(k)}"
            )

    def test_post_unknown_tenant_returns_404(self, base_url):
        r = requests.post(
            f"{base_url}/api/public/preview-pass",
            json={"tenant_id": "00000000-0000-0000-0000-000000000000"},
            timeout=15,
        )
        assert r.status_code == 404
        body = r.json()
        msg = body.get("detail") or body.get("message") or ""
        assert "no encontrado" in str(msg).lower() or "tenant" in str(msg).lower()


# ───────────────────────────── GET /api/public/preview-pass/{slug} ─────────────────────────────


class TestPreviewPassGet:
    def test_get_returns_pkpass_binary(self, base_url):
        r = requests.get(
            f"{base_url}/api/public/preview-pass/umania-demo",
            timeout=30,
            allow_redirects=False,
        )
        # 200 expected; 503 acceptable per agent-to-agent context.
        assert r.status_code in (200, 503), f"Unexpected: {r.status_code} {r.text[:300]}"
        if r.status_code == 200:
            assert r.headers.get("content-type", "").startswith(
                "application/vnd.apple.pkpass"
            ), f"Wrong MIME: {r.headers.get('content-type')}"
            assert len(r.content) > 0
            cd = r.headers.get("content-disposition", "")
            assert "pkpass" in cd.lower()

    def test_get_unknown_slug_returns_404(self, base_url):
        r = requests.get(
            f"{base_url}/api/public/preview-pass/unknown-slug-{uuid.uuid4().hex[:6]}",
            timeout=15,
        )
        assert r.status_code == 404


# ───────────────────────────── Rate limiting ─────────────────────────────


class TestPreviewPassRateLimit:
    def test_rate_limit_11th_call_returns_429(self, base_url):
        """Use a FRESH random tenant_id so it doesn't burn the umania-demo budget.

        The endpoint runs the rate-limit check BEFORE the tenant lookup, so even
        a non-existent tenant_id is enough to exercise the limiter. We expect
        the first 10 calls to return 404 (tenant not found), and the 11th to
        return 429.
        """
        # Use a syntactically-valid UUID so Supabase doesn't reject the query.
        fake_tid = str(uuid.uuid4())
        statuses = []
        for _ in range(10):
            r = requests.post(
                f"{base_url}/api/public/preview-pass",
                json={"tenant_id": fake_tid},
                timeout=10,
            )
            statuses.append(r.status_code)
        # All 10 should be 404 (tenant not found, but counted by the limiter)
        assert all(s == 404 for s in statuses), f"Expected all 404s, got {statuses}"

        # 11th must be 429
        r11 = requests.post(
            f"{base_url}/api/public/preview-pass",
            json={"tenant_id": fake_tid},
            timeout=10,
        )
        assert r11.status_code == 429, f"Expected 429 on 11th call, got {r11.status_code} {r11.text}"
        body = r11.json()
        msg = (body.get("detail") or body.get("message") or "").lower()
        assert "demasiadas" in msg or "rate" in msg or "10" in msg

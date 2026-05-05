"""GeoPass Phase 2 — Superadmin backend API tests."""
import uuid
import pytest


# Module-level container to share created tenant id across tests in TestSuperadminCRUD
_state = {}


# ───── Auth & access control ─────
class TestSuperadminAccess:
    def test_stats_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/superadmin/stats")
        assert r.status_code == 401

    def test_stats_ok_for_superadmin(self, api_client, base_url, auth_headers):
        r = api_client.get(f"{base_url}/api/superadmin/stats", headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        # Should expose at minimum some counters
        assert isinstance(d, dict)
        # Validate at least one of the known stat keys exists & is numeric
        keys = set(d.keys())
        assert keys, "expected non-empty stats payload"
        # Known shape from spec: tenants_count, socios_count, notif_count
        for k in ("tenants_count", "socios_count"):
            if k in d:
                assert isinstance(d[k], int)


# ───── Tenant list ─────
class TestSuperadminTenantsList:
    def test_list_tenants(self, api_client, base_url, auth_headers):
        r = api_client.get(f"{base_url}/api/superadmin/tenants", headers=auth_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, list)
        assert len(body) >= 1
        # Each should expose socios_count
        for t in body:
            assert "id" in t and "slug" in t and "nombre_marca" in t
            assert "socios_count" in t
            assert isinstance(t["socios_count"], int)
        # umania-demo must be present
        slugs = [t["slug"] for t in body]
        assert "umania-demo" in slugs


# ───── Create / Get / Patch / Deactivate / Delete ─────
class TestSuperadminCRUD:
    def test_create_tenant_bad_plan(self, api_client, base_url, auth_headers):
        slug = f"test-bad-plan-{uuid.uuid4().hex[:6]}"
        r = api_client.post(
            f"{base_url}/api/superadmin/tenants",
            headers=auth_headers,
            json={
                "nombre_marca": "TEST Bad Plan",
                "slug": slug,
                "plan": "ultra-mega",
            },
        )
        assert r.status_code == 400, r.text

    def test_create_tenant_ok(self, api_client, base_url, auth_headers):
        slug = f"test-sa-{uuid.uuid4().hex[:8]}"
        admin_email = f"TEST_admin_{uuid.uuid4().hex[:6]}@example.com"
        payload = {
            "nombre_marca": "TEST Superadmin Tenant",
            "slug": slug,
            "plan": "pro",
            "color_primario": "#112233",
            "color_secundario": "#AABBCC",
            "lat": 41.3851,
            "lng": 2.1734,
            "logo_url": "https://example.com/logo.png",
            "admin_email": admin_email,
            "admin_nombre": "TEST Admin",
        }
        r = api_client.post(
            f"{base_url}/api/superadmin/tenants",
            headers=auth_headers,
            json=payload,
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["slug"] == slug
        assert body["nombre_marca"] == "TEST Superadmin Tenant"
        assert body["plan"] == "pro"
        assert body["activo"] is True
        assert "id" in body
        _state["tenant_id"] = body["id"]
        _state["tenant_slug"] = slug
        _state["admin_email"] = admin_email

    def test_create_tenant_duplicate_slug_409(self, api_client, base_url, auth_headers):
        slug = _state.get("tenant_slug")
        if not slug:
            pytest.skip("create test did not run")
        r = api_client.post(
            f"{base_url}/api/superadmin/tenants",
            headers=auth_headers,
            json={
                "nombre_marca": "TEST Dup",
                "slug": slug,
                "plan": "basic",
            },
        )
        assert r.status_code == 409, r.text

    def test_get_tenant_detail(self, api_client, base_url, auth_headers):
        tid = _state.get("tenant_id")
        if not tid:
            pytest.skip("create test did not run")
        r = api_client.get(
            f"{base_url}/api/superadmin/tenants/{tid}", headers=auth_headers
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "tenant" in d
        assert d["tenant"]["id"] == tid
        assert "stats" in d
        for k in ("socios_count", "notificaciones_count", "puntos_emitidos"):
            assert k in d["stats"]
        assert "recent_socios" in d
        assert isinstance(d["recent_socios"], list)
        assert "admins" in d
        # Pre-seeded admin email should be there
        admin_emails = [a.get("email") for a in d["admins"]]
        assert _state["admin_email"] in admin_emails

    def test_get_tenant_detail_404(self, api_client, base_url, auth_headers):
        fake = str(uuid.uuid4())
        r = api_client.get(
            f"{base_url}/api/superadmin/tenants/{fake}", headers=auth_headers
        )
        assert r.status_code == 404

    def test_patch_tenant_bad_plan(self, api_client, base_url, auth_headers):
        tid = _state.get("tenant_id")
        if not tid:
            pytest.skip("create test did not run")
        r = api_client.patch(
            f"{base_url}/api/superadmin/tenants/{tid}",
            headers=auth_headers,
            json={"plan": "premium"},
        )
        assert r.status_code == 400, r.text

    def test_patch_tenant_ok(self, api_client, base_url, auth_headers):
        tid = _state.get("tenant_id")
        if not tid:
            pytest.skip("create test did not run")
        r = api_client.patch(
            f"{base_url}/api/superadmin/tenants/{tid}",
            headers=auth_headers,
            json={
                "nombre_marca": "TEST Tenant Updated",
                "plan": "enterprise",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # endpoint may return tenant or {tenant: {...}}
        if "tenant" in body:
            body = body["tenant"]
        assert body["nombre_marca"] == "TEST Tenant Updated"
        assert body["plan"] == "enterprise"

        # Verify persistence via GET
        r2 = api_client.get(
            f"{base_url}/api/superadmin/tenants/{tid}", headers=auth_headers
        )
        d = r2.json()
        assert d["tenant"]["nombre_marca"] == "TEST Tenant Updated"
        assert d["tenant"]["plan"] == "enterprise"

    def test_patch_slug_conflict_409(self, api_client, base_url, auth_headers):
        tid = _state.get("tenant_id")
        if not tid:
            pytest.skip("create test did not run")
        # Try to rename slug to umania-demo (existing)
        r = api_client.patch(
            f"{base_url}/api/superadmin/tenants/{tid}",
            headers=auth_headers,
            json={"slug": "umania-demo"},
        )
        assert r.status_code == 409, r.text

    def test_deactivate_tenant(self, api_client, base_url, auth_headers):
        tid = _state.get("tenant_id")
        if not tid:
            pytest.skip("create test did not run")
        r = api_client.post(
            f"{base_url}/api/superadmin/tenants/{tid}/deactivate",
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        # Verify activo == false
        r2 = api_client.get(
            f"{base_url}/api/superadmin/tenants/{tid}", headers=auth_headers
        )
        d = r2.json()
        assert d["tenant"]["activo"] is False

    def test_delete_tenant(self, api_client, base_url, auth_headers):
        tid = _state.get("tenant_id")
        if not tid:
            pytest.skip("create test did not run")
        r = api_client.delete(
            f"{base_url}/api/superadmin/tenants/{tid}", headers=auth_headers
        )
        assert r.status_code in (200, 204), r.text
        # Verify gone
        r2 = api_client.get(
            f"{base_url}/api/superadmin/tenants/{tid}", headers=auth_headers
        )
        assert r2.status_code == 404


# ───── Impersonation via X-Impersonate-Tenant-Id header ─────
class TestImpersonation:
    def test_me_default_tenant(self, api_client, base_url, auth_headers):
        """Without impersonation header, /api/auth/me returns superadmin's own tenant (umania-demo)."""
        r = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["rol"] == "superadmin"
        assert d["tenant"]["slug"] == "umania-demo"
        # Save own tenant id for next assertions
        _state["own_tenant_id"] = d["tenant_id"]

    def test_impersonate_other_tenant(self, api_client, base_url, auth_headers):
        """Create a fresh tenant, then call /api/auth/me with X-Impersonate-Tenant-Id and verify swap."""
        # Create temporary tenant for impersonation
        slug = f"test-imp-{uuid.uuid4().hex[:8]}"
        r = api_client.post(
            f"{base_url}/api/superadmin/tenants",
            headers=auth_headers,
            json={
                "nombre_marca": "TEST Imp Tenant",
                "slug": slug,
                "plan": "basic",
            },
        )
        assert r.status_code == 201, r.text
        target_id = r.json()["id"]
        _state["imp_tenant_id"] = target_id

        # Call /api/auth/me with impersonation header
        h = dict(auth_headers)
        h["X-Impersonate-Tenant-Id"] = target_id
        r2 = api_client.get(f"{base_url}/api/auth/me", headers=h)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        # Tenant should have swapped
        assert d["tenant_id"] == target_id
        assert d["tenant"]["slug"] == slug
        # But role must still be superadmin
        assert d["rol"] == "superadmin"

    def test_impersonate_socios_scoped(self, api_client, base_url, auth_headers):
        """When impersonating a brand-new tenant, /api/socios returns [] (it has no socios yet)."""
        target_id = _state.get("imp_tenant_id")
        if not target_id:
            pytest.skip("impersonation tenant not created")
        h = dict(auth_headers)
        h["X-Impersonate-Tenant-Id"] = target_id
        r = api_client.get(f"{base_url}/api/socios", headers=h)
        assert r.status_code == 200, r.text
        socios = r.json()
        assert isinstance(socios, list)
        # No socios in fresh tenant
        for s in socios:
            assert s["tenant_id"] == target_id
        assert len(socios) == 0

        # Also confirm without header we still see umania-demo's socios (different tenant)
        r2 = api_client.get(f"{base_url}/api/socios", headers=auth_headers)
        assert r2.status_code == 200
        own_socios = r2.json()
        if own_socios:
            assert own_socios[0]["tenant_id"] == _state["own_tenant_id"]

    def test_cleanup_impersonation_tenant(self, api_client, base_url, auth_headers):
        """Hard-delete the impersonation tenant we created."""
        target_id = _state.get("imp_tenant_id")
        if not target_id:
            pytest.skip("nothing to clean up")
        r = api_client.delete(
            f"{base_url}/api/superadmin/tenants/{target_id}", headers=auth_headers
        )
        assert r.status_code in (200, 204)

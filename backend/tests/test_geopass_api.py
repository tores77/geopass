"""GeoPass backend API tests."""
import time
import uuid
import pytest


# ───── Health ─────
class TestHealth:
    def test_root(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/")
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_health(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert body["supabase"] is True


# ───── Auth ─────
class TestAuth:
    def test_me_no_token(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401

    def test_me_bad_token(self, api_client, base_url):
        r = api_client.get(
            f"{base_url}/api/auth/me",
            headers={"Authorization": "Bearer this.is.not.a.valid.jwt"},
        )
        assert r.status_code == 401

    def test_me_valid(self, api_client, base_url, auth_headers):
        r = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == "pere@umanialabs.com"
        assert data["rol"] == "superadmin"
        assert "tenant_id" in data and data["tenant_id"]
        assert data["tenant"]["slug"] == "umania-demo"


# ───── Dashboard ─────
class TestDashboard:
    def test_stats(self, api_client, base_url, auth_headers):
        r = api_client.get(f"{base_url}/api/dashboard/stats", headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("socios_activos", "notificaciones_mes", "puntos_emitidos", "nivel_distribucion"):
            assert key in d
        assert isinstance(d["nivel_distribucion"], dict)

    def test_recent_socios(self, api_client, base_url, auth_headers):
        r = api_client.get(f"{base_url}/api/dashboard/recent-socios", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_recent_notifications(self, api_client, base_url, auth_headers):
        r = api_client.get(f"{base_url}/api/dashboard/recent-notifications", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ───── Socios CRUD ─────
@pytest.fixture(scope="module")
def created_socio(request):
    """Holds id of a socio created during tests, shared across tests in module."""
    return {}


class TestSocios:
    def test_create_socio(self, api_client, base_url, auth_headers, created_socio):
        email = f"TEST_socio_{uuid.uuid4().hex[:8]}@example.com"
        r = api_client.post(
            f"{base_url}/api/socios",
            headers=auth_headers,
            json={"nombre": "TEST Socio", "email": email, "telefono": "+34600000000"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["email"] == email
        assert body["nombre"] == "TEST Socio"
        assert "id" in body
        assert body.get("wallet_pass_serial")
        created_socio["id"] = body["id"]
        created_socio["email"] = email

    def test_list_socios_filters_tenant(self, api_client, base_url, auth_headers, created_socio):
        r = api_client.get(f"{base_url}/api/socios", headers=auth_headers)
        assert r.status_code == 200
        socios = r.json()
        assert isinstance(socios, list)
        ids = [s["id"] for s in socios]
        assert created_socio["id"] in ids
        # All socios must belong to same tenant
        tenants = {s["tenant_id"] for s in socios}
        assert len(tenants) == 1

    def test_get_socio_detail(self, api_client, base_url, auth_headers, created_socio):
        sid = created_socio["id"]
        r = api_client.get(f"{base_url}/api/socios/{sid}", headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["socio"]["id"] == sid
        assert "transacciones" in d
        assert "pass" in d
        # pass should have been created
        assert d["pass"] is not None
        assert d["pass"]["serial_number"] == d["socio"]["wallet_pass_serial"]

    def test_get_socio_not_found(self, api_client, base_url, auth_headers):
        fake = str(uuid.uuid4())
        r = api_client.get(f"{base_url}/api/socios/{fake}", headers=auth_headers)
        assert r.status_code == 404

    def test_add_points(self, api_client, base_url, auth_headers, created_socio):
        sid = created_socio["id"]
        r = api_client.post(
            f"{base_url}/api/socios/{sid}/puntos",
            headers=auth_headers,
            json={"puntos": 150, "descripcion": "TEST puntos manual"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["nuevo_total"] >= 150

        # Verify persisted
        r2 = api_client.get(f"{base_url}/api/socios/{sid}", headers=auth_headers)
        d = r2.json()
        assert d["socio"]["puntos"] >= 150
        assert any(t["puntos"] == 150 and t["tipo"] == "manual" for t in d["transacciones"])

    def test_add_points_invalid_socio(self, api_client, base_url, auth_headers):
        fake = str(uuid.uuid4())
        r = api_client.post(
            f"{base_url}/api/socios/{fake}/puntos",
            headers=auth_headers,
            json={"puntos": 10, "descripcion": "x"},
        )
        assert r.status_code == 404


# ───── Notifications ─────
class TestNotifications:
    def test_send_ambos(self, api_client, base_url, auth_headers):
        r = api_client.post(
            f"{base_url}/api/notificaciones/send",
            headers=auth_headers,
            json={"titulo": "TEST Hola", "mensaje": "TEST Mensaje broadcast", "canal": "ambos"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert "total_enviadas" in d
        assert d["notificacion"] is not None
        assert d["notificacion"]["tipo"] == "push_manual"

    def test_send_wallet(self, api_client, base_url, auth_headers):
        r = api_client.post(
            f"{base_url}/api/notificaciones/send",
            headers=auth_headers,
            json={"titulo": "TEST W", "mensaje": "TEST wallet only", "canal": "wallet"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["notificacion"]["tipo"] == "wallet_update"

    def test_send_fcm(self, api_client, base_url, auth_headers):
        r = api_client.post(
            f"{base_url}/api/notificaciones/send",
            headers=auth_headers,
            json={"titulo": "TEST F", "mensaje": "TEST fcm", "canal": "fcm"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["notificacion"]["tipo"] == "push_manual"

    def test_list_notifications(self, api_client, base_url, auth_headers):
        r = api_client.get(f"{base_url}/api/notificaciones", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1


# ───── Public endpoints ─────
class TestPublic:
    def test_get_tenant(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/public/tenants/umania-demo")
        assert r.status_code == 200
        d = r.json()
        assert d["slug"] == "umania-demo"
        assert "nombre_marca" in d

    def test_get_tenant_not_found(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/public/tenants/no-such-slug")
        assert r.status_code == 404

    def test_registro_success(self, api_client, base_url):
        email = f"TEST_reg_{uuid.uuid4().hex[:8]}@example.com"
        r = api_client.post(
            f"{base_url}/api/public/registro/umania-demo",
            json={"nombre": "TEST Publico", "email": email, "telefono": "+34611111111"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["socio"]["email"] == email
        assert d["socio"]["puntos"] == 500
        assert d["tenant"]["slug"] == "umania-demo"

    def test_registro_duplicate(self, api_client, base_url):
        email = f"TEST_dup_{uuid.uuid4().hex[:8]}@example.com"
        payload = {"nombre": "TEST Dup", "email": email}
        r1 = api_client.post(f"{base_url}/api/public/registro/umania-demo", json=payload)
        assert r1.status_code == 200
        r2 = api_client.post(f"{base_url}/api/public/registro/umania-demo", json=payload)
        assert r2.status_code == 409

    def test_registro_bad_slug(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/public/registro/no-such-slug",
            json={"nombre": "x", "email": f"TEST_bad_{uuid.uuid4().hex[:6]}@example.com"},
        )
        assert r.status_code == 404

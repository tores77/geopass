"""Tests for /api/tenant/card-config endpoints (Mi tarjeta feature)."""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

# Module: GET /api/tenant/card-config — defaults + structure
class TestCardConfigGet:
    def test_get_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/tenant/card-config")
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code} {r.text}"

    def test_get_returns_full_config_with_defaults(self, api_client, auth_headers, base_url):
        r = api_client.get(f"{base_url}/api/tenant/card-config", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        # Required keys present
        for key in [
            "nombre_marca", "slug", "logo_url",
            "color_primario", "color_secundario",
            "nombre_programa", "mensaje_geopush",
            "radio_geopush", "plantilla_fidelizacion",
        ]:
            assert key in data, f"missing key '{key}' in response: {data}"
        # Defaults sane
        assert data["plantilla_fidelizacion"] in {"puntos", "sellos", "niveles", "descuento"}
        assert isinstance(data["radio_geopush"], int)
        assert 50 <= data["radio_geopush"] <= 500


# Module: PATCH /api/tenant/card-config — updates + validation
class TestCardConfigPatch:
    def test_patch_requires_auth(self, api_client, base_url):
        r = api_client.patch(
            f"{base_url}/api/tenant/card-config",
            json={"nombre_programa": "X"},
        )
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code} {r.text}"

    def test_patch_updates_all_seven_fields_and_persists(self, api_client, auth_headers, base_url):
        payload = {
            "nombre_programa": "Club TEST Configurador",
            "color_primario": "#FF6600",
            "color_secundario": "#1122AA",
            "logo_url": None,
            "mensaje_geopush": "Hola TEST socio!",
            "radio_geopush": 250,
            "plantilla_fidelizacion": "sellos",
        }
        r = api_client.patch(
            f"{base_url}/api/tenant/card-config", json=payload, headers=auth_headers
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        cfg = body.get("config")
        assert cfg is not None, f"missing 'config' in body: {body}"
        for k, v in payload.items():
            assert cfg.get(k) == v, f"field {k}: expected {v}, got {cfg.get(k)}"

        # Persistence: GET should return same values
        r2 = api_client.get(f"{base_url}/api/tenant/card-config", headers=auth_headers)
        assert r2.status_code == 200
        cfg2 = r2.json()
        for k, v in payload.items():
            assert cfg2.get(k) == v, f"persistence: {k} expected {v}, got {cfg2.get(k)}"

    def test_patch_rejects_invalid_plantilla(self, api_client, auth_headers, base_url):
        r = api_client.patch(
            f"{base_url}/api/tenant/card-config",
            json={"plantilla_fidelizacion": "invalid_template"},
            headers=auth_headers,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"

    def test_patch_rejects_radio_out_of_range_low(self, api_client, auth_headers, base_url):
        r = api_client.patch(
            f"{base_url}/api/tenant/card-config",
            json={"radio_geopush": 10},
            headers=auth_headers,
        )
        assert r.status_code in (400, 422), f"expected 400/422, got {r.status_code} {r.text}"

    def test_patch_rejects_radio_out_of_range_high(self, api_client, auth_headers, base_url):
        r = api_client.patch(
            f"{base_url}/api/tenant/card-config",
            json={"radio_geopush": 1000},
            headers=auth_headers,
        )
        assert r.status_code in (400, 422), f"expected 400/422, got {r.status_code} {r.text}"

    def test_patch_rejects_long_nombre_programa(self, api_client, auth_headers, base_url):
        r = api_client.patch(
            f"{base_url}/api/tenant/card-config",
            json={"nombre_programa": "x" * 61},
            headers=auth_headers,
        )
        assert r.status_code in (400, 422), f"expected 400/422, got {r.status_code} {r.text}"

    def test_patch_rejects_long_mensaje_geopush(self, api_client, auth_headers, base_url):
        r = api_client.patch(
            f"{base_url}/api/tenant/card-config",
            json={"mensaje_geopush": "x" * 61},
            headers=auth_headers,
        )
        assert r.status_code in (400, 422), f"expected 400/422, got {r.status_code} {r.text}"

    def test_patch_accepts_all_four_templates(self, api_client, auth_headers, base_url):
        for tpl in ["puntos", "sellos", "niveles", "descuento"]:
            r = api_client.patch(
                f"{base_url}/api/tenant/card-config",
                json={"plantilla_fidelizacion": tpl},
                headers=auth_headers,
            )
            assert r.status_code == 200, f"{tpl} -> {r.status_code} {r.text}"
            assert r.json().get("config", {}).get("plantilla_fidelizacion") == tpl

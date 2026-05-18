"""GeoPass FastAPI backend.

The frontend uses Supabase Auth (anon key) for login/session.
ALL data operations go through this backend, which uses the
service_role key to bypass RLS but ALWAYS filters by tenant_id
derived from the JWT.

NOTE: supabase-py sync clients wrap an httpx HTTP/2 connection that is NOT
safe to share across concurrent FastAPI requests (H2 stream state races
produce RemoteProtocolError). We therefore create a fresh Supabase Client
per request via FastAPI dependencies.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from typing import Any, Optional
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
import os
import json as _json
import uuid
import base64
import asyncio
import logging
import httpx


class UTF8JSONResponse(JSONResponse):
    """JSON responses with explicit UTF-8 charset + non-escaped unicode.

    Fixes garbled ñ/tildes on iOS and other clients that default to Latin-1
    when no charset is present in the Content-Type header.
    """

    media_type = "application/json; charset=utf-8"

    def render(self, content: Any) -> bytes:
        return _json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
RAILWAY_API_URL = os.environ.get("RAILWAY_API_URL", "")

# Announce the Railway URL at import time so it's visible in the very first
# lines of the production log.
print(f"[BOOT] RAILWAY_API_URL = {RAILWAY_API_URL or 'NOT SET'}", flush=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("geopass")


# ───────────────────────────── Firebase Admin (FCM) ─────────────────────────────
# Initialised lazily from the FIREBASE_SERVICE_ACCOUNT_JSON env var. If the env
# var is missing or invalid, FCM falls back to mock mode (logged warning, no
# crash) so the rest of the app keeps working.
_FCM_READY = False
try:
    import firebase_admin
    from firebase_admin import credentials as _fb_credentials, messaging as fcm_messaging

    _fb_raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if _fb_raw:
        try:
            _fb_dict = _json.loads(_fb_raw)
            if not firebase_admin._apps:
                firebase_admin.initialize_app(_fb_credentials.Certificate(_fb_dict))
            _FCM_READY = True
            logger.info(
                "FCM initialised for project %s",
                _fb_dict.get("project_id", "unknown"),
            )
        except Exception as e:
            logger.warning("FCM init failed (will fall back to mock): %s", e)
    else:
        logger.warning("FIREBASE_SERVICE_ACCOUNT_JSON not set — FCM running in MOCK mode")
except Exception as e:
    logger.warning("firebase_admin not importable — FCM running in MOCK mode: %s", e)


def send_fcm_notification(token: str, title: str, body: str) -> bool:
    """Send a real FCM push to a single device token.

    Returns True on success, False on any failure. Never raises. When
    Firebase is not configured, logs a single line and returns False so the
    caller treats it as a mocked / not-delivered send.
    """
    if not token:
        return False
    if not _FCM_READY:
        logger.info("FCM MOCK send to %s…: %s — %s", token[:10], title, body[:40])
        return False
    try:
        message = fcm_messaging.Message(
            notification=fcm_messaging.Notification(title=title, body=body),
            token=token,
        )
        message_id = fcm_messaging.send(message)
        logger.info("FCM sent token=%s… message_id=%s", token[:10], message_id)
        return True
    except Exception as e:
        logger.warning("FCM send failed token=%s… err=%s: %s", token[:10], type(e).__name__, e)
        return False


app = FastAPI(title="GeoPass API", default_response_class=UTF8JSONResponse)
api = APIRouter(prefix="/api", default_response_class=UTF8JSONResponse)


@app.exception_handler(HTTPException)
def _http_exception_handler(_request, exc: HTTPException):
    return UTF8JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=getattr(exc, "headers", None),
    )


# Root-level liveness probe — used by the Kubernetes/nginx ingress
# health check at GET /health (without the /api prefix). Must respond
# 200 instantly without touching any external service.
@app.get("/health")
def _liveness():
    return {"status": "ok"}


# ───────────────────────────── DI: Supabase clients ─────────────────────────────
def sb_dep() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def anon_dep() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


# ───────────────────────────── Auth helper ─────────────────────────────
class CurrentUser(BaseModel):
    user_id: str
    email: str
    nombre: str
    rol: str
    tenant_id: str
    tenant: dict


def get_current_user(
    authorization: Optional[str] = Header(None),
    x_impersonate_tenant_id: Optional[str] = Header(None),
    sb: Client = Depends(sb_dep),
    anon: Client = Depends(anon_dep),
) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Falta token de autenticación")
    token = authorization.split(" ", 1)[1]
    try:
        res = anon.auth.get_user(token)
        user = res.user
        if not user:
            raise HTTPException(401, "Token inválido")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"JWT validation failed: {e}")
        raise HTTPException(401, "Sesión inválida o expirada")

    admin_rows = (
        sb.table("usuarios_admin")
        .select("*")
        .eq("email", user.email)
        .eq("activo", True)
        .limit(1)
        .execute()
        .data
    )
    if not admin_rows:
        raise HTTPException(403, "Usuario no autorizado para este panel")
    admin = admin_rows[0]

    effective_tenant_id = admin["tenant_id"]
    # Superadmin impersonation: only honour the override when the actual
    # admin record has rol='superadmin'. Anyone else trying to send the
    # header is silently ignored.
    if x_impersonate_tenant_id and admin.get("rol") == "superadmin":
        effective_tenant_id = x_impersonate_tenant_id

    tenant_rows = (
        sb.table("tenants").select("*").eq("id", effective_tenant_id).limit(1).execute().data
    )
    if not tenant_rows:
        raise HTTPException(403, "Tenant no encontrado")

    return CurrentUser(
        user_id=user.id,
        email=user.email,
        nombre=admin["nombre"],
        rol=admin["rol"],
        tenant_id=effective_tenant_id,
        tenant=tenant_rows[0],
    )


def superadmin_required(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Dependency that enforces rol == 'superadmin'.

    NOTE: even when the user is impersonating another tenant, their *actual*
    role is preserved on `CurrentUser.rol` because the impersonation override
    only changes `tenant_id` / `tenant`.
    """
    if user.rol != "superadmin":
        raise HTTPException(403, "Acceso restringido a superadmin")
    return user


# ───────────────────────────── Pydantic models ─────────────────────────────
class SocioCreate(BaseModel):
    nombre: str
    email: EmailStr
    telefono: Optional[str] = None


class PuntosAdd(BaseModel):
    puntos: int = Field(gt=0)
    descripcion: str


class NotificationSend(BaseModel):
    titulo: str = Field(max_length=50)
    mensaje: str = Field(max_length=150)
    canal: str = Field(default="ambos")  # wallet | fcm | ambos
    socio_id: Optional[str] = None  # None = broadcast to all


class TenantCreate(BaseModel):
    nombre_marca: str
    slug: str
    plan: str = "basic"
    color_primario: Optional[str] = "#00E5A0"
    color_secundario: Optional[str] = "#0EA5E9"
    lat: Optional[float] = None
    lng: Optional[float] = None
    logo_url: Optional[str] = None
    admin_email: Optional[EmailStr] = None
    admin_nombre: Optional[str] = None


class TenantUpdate(BaseModel):
    nombre_marca: Optional[str] = None
    slug: Optional[str] = None
    plan: Optional[str] = None
    color_primario: Optional[str] = None
    color_secundario: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    logo_url: Optional[str] = None
    activo: Optional[bool] = None


class RegistroPublico(BaseModel):
    nombre: str
    email: EmailStr
    telefono: Optional[str] = None
    push_token: Optional[str] = None


class PushTokenUpdate(BaseModel):
    serial_number: str
    push_token: str


# ───────────────────────────── Health ─────────────────────────────
@api.get("/")
def root():
    return {"service": "GeoPass API", "ok": True}


@api.get("/health")
def health():
    return {"status": "ok", "supabase": bool(SUPABASE_URL)}


@api.get("/test-railway")
async def test_railway():
    """Diagnostics: prove the backend can reach Railway and report timings.

    Returns the Railway URL we are using plus the status and latency of a
    live GET /health and POST /passes/create round-trip.
    """
    url = RAILWAY_API_URL or ""
    out = {"railway_url": url or "NOT SET", "checks": {}}

    async def _probe(method: str, path: str, json_body=None):
        started = datetime.now(timezone.utc)
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                if method == "GET":
                    r = await client.get(f"{url}{path}")
                else:
                    r = await client.post(f"{url}{path}", json=json_body)
            elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            return {
                "ok": r.status_code < 400,
                "status": r.status_code,
                "elapsed_ms": elapsed_ms,
                "content_type": r.headers.get("content-type"),
                "bytes": len(r.content),
            }
        except Exception as e:
            elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            return {
                "ok": False,
                "status": None,
                "elapsed_ms": elapsed_ms,
                "error_type": type(e).__name__,
                "error": str(e)[:300],
            }

    if not url:
        return out

    out["checks"]["GET /health"] = await _probe("GET", "/health")
    out["checks"]["POST /passes/create (smoke)"] = await _probe(
        "POST",
        "/passes/create",
        json_body={
            "tenant_id": "diagnostic",
            "socio_id": "diagnostic",
            "serial_number": "diagnostic-" + uuid.uuid4().hex[:8],
            "nombre": "Diagnostic",
            "puntos": 0,
            "nivel": "basico",
            "nombre_marca": "Diagnostic",
        },
    )
    return out


# ───────────────────────────── Auth ─────────────────────────────
@api.get("/auth/me")
def auth_me(user: CurrentUser = Depends(get_current_user)):
    return {
        "email": user.email,
        "nombre": user.nombre,
        "rol": user.rol,
        "tenant_id": user.tenant_id,
        "tenant": user.tenant,
    }


# ───────────────────────────── Dashboard ─────────────────────────────
@api.get("/dashboard/stats")
def dashboard_stats(
    user: CurrentUser = Depends(get_current_user), sb: Client = Depends(sb_dep)
):
    tid = user.tenant_id
    socios_count = (
        sb.table("socios")
        .select("id", count="exact")
        .eq("tenant_id", tid)
        .eq("activo", True)
        .execute()
        .count
    ) or 0

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    notif_count = (
        sb.table("notificaciones")
        .select("id", count="exact")
        .eq("tenant_id", tid)
        .gte("created_at", month_start)
        .execute()
        .count
    ) or 0

    tx_rows = (
        sb.table("transacciones_puntos")
        .select("puntos")
        .eq("tenant_id", tid)
        .gt("puntos", 0)
        .limit(10000)
        .execute()
        .data
    )
    puntos_total = sum(r["puntos"] for r in tx_rows)

    nivel_rows = (
        sb.table("socios")
        .select("nivel")
        .eq("tenant_id", tid)
        .eq("activo", True)
        .limit(10000)
        .execute()
        .data
    )
    nivel_dist: dict = {}
    for r in nivel_rows:
        n = r.get("nivel") or "basico"
        nivel_dist[n] = nivel_dist.get(n, 0) + 1

    return {
        "socios_activos": socios_count,
        "notificaciones_mes": notif_count,
        "puntos_emitidos": puntos_total,
        "nivel_distribucion": nivel_dist,
    }


@api.get("/dashboard/recent-socios")
def dashboard_recent_socios(
    user: CurrentUser = Depends(get_current_user), sb: Client = Depends(sb_dep)
):
    return (
        sb.table("socios")
        .select("*")
        .eq("tenant_id", user.tenant_id)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
        .data
    )


@api.get("/dashboard/recent-notifications")
def dashboard_recent_notifications(
    user: CurrentUser = Depends(get_current_user), sb: Client = Depends(sb_dep)
):
    return (
        sb.table("notificaciones")
        .select("*")
        .eq("tenant_id", user.tenant_id)
        .order("created_at", desc=True)
        .limit(5)
        .execute()
        .data
    )


# ───────────────────────────── Socios ─────────────────────────────
@api.get("/socios")
def list_socios(
    user: CurrentUser = Depends(get_current_user), sb: Client = Depends(sb_dep)
):
    return (
        sb.table("socios")
        .select("*")
        .eq("tenant_id", user.tenant_id)
        .order("created_at", desc=True)
        .limit(2000)
        .execute()
        .data
    )


@api.get("/socios/{socio_id}")
def get_socio(
    socio_id: str,
    user: CurrentUser = Depends(get_current_user),
    sb: Client = Depends(sb_dep),
):
    rows = (
        sb.table("socios")
        .select("*")
        .eq("tenant_id", user.tenant_id)
        .eq("id", socio_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(404, "Socio no encontrado")
    socio = rows[0]
    tx = (
        sb.table("transacciones_puntos")
        .select("*")
        .eq("tenant_id", user.tenant_id)
        .eq("socio_id", socio_id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
        .data
    )
    pass_rows = (
        sb.table("passes")
        .select("*")
        .eq("tenant_id", user.tenant_id)
        .eq("socio_id", socio_id)
        .limit(1)
        .execute()
        .data
    )
    return {"socio": socio, "transacciones": tx, "pass": pass_rows[0] if pass_rows else None}


@api.post("/socios")
def create_socio(
    body: SocioCreate,
    user: CurrentUser = Depends(get_current_user),
    sb: Client = Depends(sb_dep),
):
    socio, _ = _create_socio_full(
        sb, user.tenant, body.nombre, body.email, body.telefono, welcome_points=0, fetch_pkpass=False
    )
    return socio


@api.post("/socios/{socio_id}/puntos")
def add_points(
    socio_id: str,
    body: PuntosAdd,
    user: CurrentUser = Depends(get_current_user),
    sb: Client = Depends(sb_dep),
):
    socio_rows = (
        sb.table("socios")
        .select("id, puntos")
        .eq("tenant_id", user.tenant_id)
        .eq("id", socio_id)
        .limit(1)
        .execute()
        .data
    )
    if not socio_rows:
        raise HTTPException(404, "Socio no encontrado")
    new_total = (socio_rows[0]["puntos"] or 0) + body.puntos
    sb.table("socios").update({"puntos": new_total}).eq("id", socio_id).eq(
        "tenant_id", user.tenant_id
    ).execute()
    sb.table("transacciones_puntos").insert(
        {
            "tenant_id": user.tenant_id,
            "socio_id": socio_id,
            "tipo": "manual",
            "puntos": body.puntos,
            "descripcion": body.descripcion,
        }
    ).execute()
    return {"ok": True, "nuevo_total": new_total}


# ───────────────────────────── Notifications ─────────────────────────────
@api.get("/notificaciones")
def list_notifications(
    user: CurrentUser = Depends(get_current_user), sb: Client = Depends(sb_dep)
):
    return (
        sb.table("notificaciones")
        .select("*")
        .eq("tenant_id", user.tenant_id)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
        .data
    )


@api.post("/notificaciones/send")
def send_notification(
    body: NotificationSend,
    user: CurrentUser = Depends(get_current_user),
    sb: Client = Depends(sb_dep),
):
    tid = user.tenant_id

    q = sb.table("socios").select("*").eq("tenant_id", tid).eq("activo", True).limit(5000)
    if body.socio_id:
        q = q.eq("id", body.socio_id)
    socios = q.execute().data
    if not socios:
        raise HTTPException(400, "No hay socios destinatarios")

    sent_wallet = 0
    sent_fcm = 0

    if body.canal in ("wallet", "ambos"):
        for s in socios:
            serial = s.get("wallet_pass_serial")
            if not serial or not RAILWAY_API_URL:
                continue
            try:
                with httpx.Client(timeout=5.0) as client:
                    r = client.post(
                        f"{RAILWAY_API_URL}/passes/{serial}/update",
                        json={"titulo": body.titulo, "mensaje": body.mensaje},
                    )
                if r.status_code < 400:
                    sent_wallet += 1
            except Exception as e:
                logger.info(f"Railway push failed (silenced): {e}")

    if body.canal in ("fcm", "ambos"):
        for s in socios:
            tok = s.get("push_token")
            if not tok:
                continue
            if send_fcm_notification(tok, body.titulo, body.mensaje):
                sent_fcm += 1

    total = max(sent_wallet, sent_fcm) if body.canal == "ambos" else sent_wallet + sent_fcm
    if total == 0:
        total = len(socios)

    tipo = "wallet_update" if body.canal == "wallet" else "push_manual"
    inserted = (
        sb.table("notificaciones")
        .insert(
            {
                "tenant_id": tid,
                "titulo": body.titulo,
                "mensaje": body.mensaje,
                "tipo": tipo,
                "canal": body.canal,
                "total_enviadas": total,
                "total_abiertas": 0,
            }
        )
        .execute()
        .data
    )
    return {
        "ok": True,
        "destinatarios": len(socios),
        "total_enviadas": total,
        "wallet": sent_wallet,
        "fcm": sent_fcm,
        "notificacion": inserted[0] if inserted else None,
    }


# ───────────────────────────── Public: tenant + registro ─────────────────────────────
@api.get("/public/tenants/{slug}")
def public_tenant(slug: str, sb: Client = Depends(sb_dep)):
    rows = (
        sb.table("tenants")
        .select(
            "id, nombre_marca, slug, logo_url, color_primario, color_secundario, activo"
        )
        .eq("slug", slug)
        .limit(1)
        .execute()
        .data
    )
    if not rows or not rows[0]["activo"]:
        raise HTTPException(404, "Tenant no encontrado")
    return rows[0]


@api.post("/public/registro/{slug}")
def public_registro(slug: str, body: RegistroPublico, sb: Client = Depends(sb_dep)):
    rows = sb.table("tenants").select("*").eq("slug", slug).limit(1).execute().data
    if not rows or not rows[0]["activo"]:
        raise HTTPException(404, "Tenant no encontrado")
    tenant = rows[0]
    tid = tenant["id"]

    dup = (
        sb.table("socios")
        .select("id")
        .eq("tenant_id", tid)
        .eq("email", body.email)
        .limit(1)
        .execute()
        .data
    )
    if dup:
        raise HTTPException(409, "Este email ya está registrado en esta tarjeta")

    socio, pkpass_b64 = _create_socio_full(
        sb, tenant, body.nombre, body.email, body.telefono, welcome_points=500, fetch_pkpass=True
    )

    # Persist push_token immediately if the client sent one with registration.
    if body.push_token:
        try:
            sb.table("socios").update({"push_token": body.push_token}).eq(
                "id", socio["id"]
            ).eq("tenant_id", tid).execute()
            socio["push_token"] = body.push_token
        except Exception as e:
            logger.warning("registro push_token save failed: %s", e)

    return {
        "success": True,
        "socio_id": socio["id"],
        "socio_nombre": socio["nombre"],
        "socio_email": socio["email"],
        "socio_serial": socio["wallet_pass_serial"],
        "puntos": socio["puntos"],
        "pkpass_base64": pkpass_b64,
        "pkpass_url": f"/api/passes/{socio['wallet_pass_serial']}/download",
        "tenant": tenant,
    }


@api.post("/public/push-token")
def public_update_push_token(body: PushTokenUpdate, sb: Client = Depends(sb_dep)):
    """Public endpoint — update a socio's FCM push token using their wallet serial."""
    if not body.push_token:
        raise HTTPException(400, "push_token requerido")
    rows = (
        sb.table("socios")
        .select("id, tenant_id")
        .eq("wallet_pass_serial", body.serial_number)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(404, "Socio no encontrado")
    sb.table("socios").update({"push_token": body.push_token}).eq(
        "id", rows[0]["id"]
    ).execute()
    return {"ok": True}


# ───────────────────────────── Wallet pass download ─────────────────────────────
@api.get("/passes/{serial_number}/download")
def download_pass(serial_number: str, sb: Client = Depends(sb_dep)):
    """Re-generate the .pkpass from Railway using stored socio data."""
    pass_rows = (
        sb.table("passes")
        .select("*")
        .eq("serial_number", serial_number)
        .eq("activo", True)
        .limit(1)
        .execute()
        .data
    )
    if not pass_rows:
        raise HTTPException(404, "Pass no encontrado")
    p = pass_rows[0]

    socio_rows = (
        sb.table("socios")
        .select("*")
        .eq("id", p["socio_id"])
        .eq("tenant_id", p["tenant_id"])
        .limit(1)
        .execute()
        .data
    )
    if not socio_rows:
        raise HTTPException(404, "Socio no encontrado")
    socio = socio_rows[0]

    tenant_rows = (
        sb.table("tenants").select("*").eq("id", p["tenant_id"]).limit(1).execute().data
    )
    if not tenant_rows:
        raise HTTPException(404, "Tenant no encontrado")
    tenant = tenant_rows[0]

    pkpass_bytes = _generate_pkpass_bytes(socio, tenant)
    if not pkpass_bytes:
        # Single retry to ride out Railway cold-starts / intermittent 5xx.
        logger.warning("pkpass DOWNLOAD retry serial=%s", serial_number)
        pkpass_bytes = _generate_pkpass_bytes(socio, tenant)
    if not pkpass_bytes:
        raise HTTPException(
            503,
            "El servicio de generación de tarjetas está tardando en responder. Vuelve a intentarlo en unos segundos.",
        )
    return Response(
        content=pkpass_bytes,
        media_type="application/vnd.apple.pkpass",
        headers={
            "Content-Disposition": f'attachment; filename="geopass-{serial_number}.pkpass"',
            "Cache-Control": "no-store",
        },
    )


# ───────────────────────────── Superadmin (Umania Labs) ─────────────────────────────
ALLOWED_PLANS = {"basic", "pro", "enterprise"}


@api.get("/superadmin/stats")
def superadmin_stats(
    user: CurrentUser = Depends(superadmin_required), sb: Client = Depends(sb_dep)
):
    tenants_active = (
        sb.table("tenants")
        .select("id", count="exact")
        .eq("activo", True)
        .execute()
        .count
    ) or 0
    socios_total = (
        sb.table("socios")
        .select("id", count="exact")
        .eq("activo", True)
        .execute()
        .count
    ) or 0
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    notif_month = (
        sb.table("notificaciones")
        .select("id", count="exact")
        .gte("created_at", month_start)
        .execute()
        .count
    ) or 0
    return {
        "tenants_activos": tenants_active,
        "socios_total": socios_total,
        "notificaciones_mes": notif_month,
    }


@api.get("/superadmin/tenants")
def superadmin_list_tenants(
    user: CurrentUser = Depends(superadmin_required), sb: Client = Depends(sb_dep)
):
    tenants = (
        sb.table("tenants").select("*").order("created_at", desc=True).limit(500).execute().data
    )
    # Compute socio counts per tenant in two queries (count + group emulated)
    socios = (
        sb.table("socios")
        .select("tenant_id")
        .eq("activo", True)
        .limit(20000)
        .execute()
        .data
    )
    counts: dict = {}
    for s in socios:
        counts[s["tenant_id"]] = counts.get(s["tenant_id"], 0) + 1
    for t in tenants:
        t["socios_count"] = counts.get(t["id"], 0)
    return tenants


@api.post("/superadmin/tenants", status_code=201)
def superadmin_create_tenant(
    body: TenantCreate,
    user: CurrentUser = Depends(superadmin_required),
    sb: Client = Depends(sb_dep),
):
    if body.plan not in ALLOWED_PLANS:
        raise HTTPException(400, f"Plan inválido. Permitidos: {', '.join(sorted(ALLOWED_PLANS))}")

    # Reject duplicate slug.
    existing = (
        sb.table("tenants").select("id").eq("slug", body.slug).limit(1).execute().data
    )
    if existing:
        raise HTTPException(409, "Ya existe un tenant con ese slug")

    payload = {
        "nombre_marca": body.nombre_marca,
        "slug": body.slug,
        "plan": body.plan,
        "color_primario": body.color_primario or "#00E5A0",
        "color_secundario": body.color_secundario or "#0EA5E9",
        "lat": body.lat,
        "lng": body.lng,
        "logo_url": body.logo_url,
        "activo": True,
    }
    inserted = sb.table("tenants").insert(payload).execute().data
    if not inserted:
        raise HTTPException(500, "No se pudo crear el tenant")
    tenant = inserted[0]

    # Optional: also create a default usuarios_admin record so the new
    # tenant has at least one admin contact pre-seeded.
    if body.admin_email:
        try:
            sb.table("usuarios_admin").insert(
                {
                    "tenant_id": tenant["id"],
                    "email": body.admin_email,
                    "nombre": body.admin_nombre or body.nombre_marca,
                    "rol": "admin",
                    "activo": True,
                }
            ).execute()
        except Exception as e:
            logger.warning(f"admin seed failed: {e}")

    return tenant


@api.get("/superadmin/tenants/{tenant_id}")
def superadmin_tenant_detail(
    tenant_id: str,
    user: CurrentUser = Depends(superadmin_required),
    sb: Client = Depends(sb_dep),
):
    rows = sb.table("tenants").select("*").eq("id", tenant_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Tenant no encontrado")
    tenant = rows[0]

    socios_count = (
        sb.table("socios")
        .select("id", count="exact")
        .eq("tenant_id", tenant_id)
        .eq("activo", True)
        .execute()
        .count
    ) or 0
    notif_count = (
        sb.table("notificaciones")
        .select("id", count="exact")
        .eq("tenant_id", tenant_id)
        .execute()
        .count
    ) or 0
    tx_rows = (
        sb.table("transacciones_puntos")
        .select("puntos")
        .eq("tenant_id", tenant_id)
        .gt("puntos", 0)
        .limit(10000)
        .execute()
        .data
    )
    puntos_total = sum(r["puntos"] for r in tx_rows)
    recent_socios = (
        sb.table("socios")
        .select("id, nombre, email, puntos, nivel, created_at")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
        .data
    )
    admins = (
        sb.table("usuarios_admin")
        .select("id, email, nombre, rol, activo, created_at")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )

    return {
        "tenant": tenant,
        "stats": {
            "socios_count": socios_count,
            "notificaciones_count": notif_count,
            "puntos_emitidos": puntos_total,
        },
        "recent_socios": recent_socios,
        "admins": admins,
    }


@api.patch("/superadmin/tenants/{tenant_id}")
def superadmin_update_tenant(
    tenant_id: str,
    body: TenantUpdate,
    user: CurrentUser = Depends(superadmin_required),
    sb: Client = Depends(sb_dep),
):
    rows = sb.table("tenants").select("id").eq("id", tenant_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Tenant no encontrado")

    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None or k == "activo"}
    if "plan" in update and update["plan"] not in ALLOWED_PLANS:
        raise HTTPException(400, f"Plan inválido. Permitidos: {', '.join(sorted(ALLOWED_PLANS))}")
    if "slug" in update:
        dup = (
            sb.table("tenants")
            .select("id")
            .eq("slug", update["slug"])
            .neq("id", tenant_id)
            .limit(1)
            .execute()
            .data
        )
        if dup:
            raise HTTPException(409, "Ya existe un tenant con ese slug")

    if not update:
        return sb.table("tenants").select("*").eq("id", tenant_id).limit(1).execute().data[0]

    sb.table("tenants").update(update).eq("id", tenant_id).execute()
    return sb.table("tenants").select("*").eq("id", tenant_id).limit(1).execute().data[0]


@api.post("/superadmin/tenants/{tenant_id}/deactivate")
def superadmin_deactivate_tenant(
    tenant_id: str,
    user: CurrentUser = Depends(superadmin_required),
    sb: Client = Depends(sb_dep),
):
    rows = sb.table("tenants").select("id").eq("id", tenant_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Tenant no encontrado")
    sb.table("tenants").update({"activo": False}).eq("id", tenant_id).execute()
    return {"ok": True}


@api.delete("/superadmin/tenants/{tenant_id}")
def superadmin_delete_tenant(
    tenant_id: str,
    user: CurrentUser = Depends(superadmin_required),
    sb: Client = Depends(sb_dep),
):
    rows = sb.table("tenants").select("id").eq("id", tenant_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Tenant no encontrado")
    # Delete dependent rows first (no ON DELETE CASCADE assumed).
    for table in ("retos_progreso", "retos", "transacciones_puntos", "passes", "socios", "notificaciones", "comercios_aliados", "usuarios_admin"):
        try:
            sb.table(table).delete().eq("tenant_id", tenant_id).execute()
        except Exception as e:
            logger.warning(f"cleanup {table} failed: {e}")
    sb.table("tenants").delete().eq("id", tenant_id).execute()
    return {"ok": True}


# ───────────────────────────── Helpers ─────────────────────────────
def _build_pass_payload(socio: dict, tenant: dict) -> dict:
    payload = {
        "tenant_id": tenant["id"],
        "socio_id": socio["id"],
        "serial_number": socio["wallet_pass_serial"],
        "nombre": socio["nombre"],
        "puntos": socio.get("puntos", 0),
        "nivel": socio.get("nivel") or "basico",
        "nombre_marca": tenant.get("nombre_marca"),
    }
    # Optional geopush coordinates — only included if the tenant has them.
    if tenant.get("lat") is not None and tenant.get("lng") is not None:
        payload["lat"] = tenant["lat"]
        payload["lng"] = tenant["lng"]
        payload["radio_metros"] = 150
    return payload


def _generate_pkpass_bytes(socio: dict, tenant: dict) -> Optional[bytes]:
    """Call Railway POST /passes/create and return the .pkpass binary bytes.

    Returns None if Railway is unreachable or responds with an error. All
    failure modes are logged at WARNING with the Railway status, elapsed
    time, content-type and up-to 500-char body snippet for diagnosis.
    """
    if not RAILWAY_API_URL:
        logger.warning("pkpass: RAILWAY_API_URL is empty — cannot generate")
        return None
    payload = _build_pass_payload(socio, tenant)
    serial = payload.get("serial_number")
    target_url = f"{RAILWAY_API_URL}/passes/create"
    logger.info("pkpass → POST %s serial=%s", target_url, serial)
    started = datetime.now(timezone.utc)
    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.post(target_url, json=payload)
        elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
        ctype = r.headers.get("content-type", "").lower()
        if r.status_code >= 400:
            body_snippet = r.text[:500] if r.text else "<empty>"
            logger.warning(
                "pkpass FAILED serial=%s status=%d ctype=%s elapsed=%dms body=%s",
                serial, r.status_code, ctype, elapsed_ms, body_snippet,
            )
            return None
        if not ("pkpass" in ctype or "zip" in ctype or "octet-stream" in ctype):
            body_snippet = r.text[:500] if r.text else "<empty>"
            logger.warning(
                "pkpass UNEXPECTED-CT serial=%s status=%d ctype=%s elapsed=%dms body=%s",
                serial, r.status_code, ctype, elapsed_ms, body_snippet,
            )
            return None
        logger.info(
            "pkpass OK serial=%s status=%d bytes=%d elapsed=%dms",
            serial, r.status_code, len(r.content), elapsed_ms,
        )
        return r.content
    except httpx.TimeoutException as e:
        elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
        logger.warning("pkpass TIMEOUT serial=%s elapsed=%dms err=%s", serial, elapsed_ms, e)
        return None
    except Exception as e:
        elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
        logger.warning(
            "pkpass EXCEPTION serial=%s elapsed=%dms err=%s: %s",
            serial, elapsed_ms, type(e).__name__, e,
        )
        return None


def _create_socio_full(
    sb: Client,
    tenant: dict,
    nombre: str,
    email: str,
    telefono: Optional[str],
    welcome_points: int,
    fetch_pkpass: bool = False,
):
    tenant_id = tenant["id"]
    serial = str(uuid.uuid4())
    socio_payload = {
        "tenant_id": tenant_id,
        "nombre": nombre,
        "email": email,
        "telefono": telefono,
        "puntos": welcome_points,
        "wallet_pass_serial": serial,
        "activo": True,
    }
    inserted = sb.table("socios").insert(socio_payload).execute().data
    if not inserted:
        raise HTTPException(500, "No se pudo crear el socio")
    socio = inserted[0]

    pass_payload = {
        "tenant_id": tenant_id,
        "socio_id": socio["id"],
        "serial_number": serial,
        "authentication_token": str(uuid.uuid4()),
        "pass_type_id": "pass.com.umania.geopass",
        "activo": True,
    }
    try:
        sb.table("passes").insert(pass_payload).execute()
    except Exception as e:
        logger.warning(f"pass insert failed: {e}")

    if welcome_points > 0:
        try:
            sb.table("transacciones_puntos").insert(
                {
                    "tenant_id": tenant_id,
                    "socio_id": socio["id"],
                    "tipo": "registro",
                    "puntos": welcome_points,
                    "descripcion": "Bienvenida",
                }
            ).execute()
        except Exception as e:
            logger.warning(f"welcome tx failed: {e}")

    pkpass_b64: Optional[str] = None
    if fetch_pkpass:
        pkpass_bytes = _generate_pkpass_bytes(socio, tenant)
        if pkpass_bytes:
            pkpass_b64 = base64.b64encode(pkpass_bytes).decode("ascii")
    else:
        # Fire-and-forget best-effort: still warm up the Railway service so
        # the first GET /passes/:serial/download is fast.
        if RAILWAY_API_URL:
            try:
                with httpx.Client(timeout=5.0) as client:
                    client.post(
                        f"{RAILWAY_API_URL}/passes/create",
                        json=_build_pass_payload(socio, tenant),
                    )
            except Exception as e:
                logger.info(f"Railway warmup silenced: {e}")

    return socio, pkpass_b64


# ───────────────────────────── Wire up ─────────────────────────────
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ───────────────────────────── Railway keep-alive ─────────────────────────────
KEEPALIVE_INTERVAL_SECONDS = 240  # 4 minutes — Railway free tier idles ~5min


async def keepalive_railway() -> None:
    """Ping Railway /health every 4 minutes to prevent cold starts."""
    while True:
        await asyncio.sleep(KEEPALIVE_INTERVAL_SECONDS)
        if not RAILWAY_API_URL:
            continue
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{RAILWAY_API_URL}/health")
            logger.info("keepalive railway status=%d", r.status_code)
        except Exception as e:
            logger.info("keepalive railway failed (silenced): %s", e)


@app.on_event("startup")
async def start_keepalive() -> None:
    if RAILWAY_API_URL:
        asyncio.create_task(keepalive_railway())
        logger.info("keepalive scheduled every %ds for %s", KEEPALIVE_INTERVAL_SECONDS, RAILWAY_API_URL)

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

app = FastAPI(title="GeoPass API", default_response_class=UTF8JSONResponse)
api = APIRouter(prefix="/api", default_response_class=UTF8JSONResponse)


@app.exception_handler(HTTPException)
def _http_exception_handler(_request, exc: HTTPException):
    return UTF8JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=getattr(exc, "headers", None),
    )


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

    tenant_rows = (
        sb.table("tenants").select("*").eq("id", admin["tenant_id"]).limit(1).execute().data
    )
    if not tenant_rows:
        raise HTTPException(403, "Tenant no encontrado")

    return CurrentUser(
        user_id=user.id,
        email=user.email,
        nombre=admin["nombre"],
        rol=admin["rol"],
        tenant_id=admin["tenant_id"],
        tenant=tenant_rows[0],
    )


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


class RegistroPublico(BaseModel):
    nombre: str
    email: EmailStr
    telefono: Optional[str] = None


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
            if s.get("push_token"):
                # MOCKED: would call Firebase here in phase 2
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

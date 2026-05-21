# GeoPass™ MVP — PRD & Status

## Original Problem Statement
Build **GeoPass™** by Umania Labs, Phase 1 MVP — a white-label digital loyalty
card platform for local businesses. Multi-tenant from day one. Supabase as DB
(schema pre-existing), FastAPI backend, React/Tailwind frontend, Spanish UI,
Apple/Google Wallet integration via external Railway microservice (graceful
degradation), FCM mocked in Phase 1.

## Architecture
- **Frontend** (React + Tailwind) — Supabase JS Auth (anon key) for login/session.
  Calls FastAPI backend for ALL data ops via Bearer token.
- **Backend** (FastAPI) — Per-request Supabase clients (service_role key)
  bypass RLS but ALWAYS filter by `tenant_id` derived from the logged-in
  admin's email lookup in `usuarios_admin`.
- **DB** (Supabase Postgres, RLS on, 9 tables already provisioned).
- **Pass generation** — `https://geopass-passes.up.railway.app` (not deployed
  yet — calls wrapped in try/except, app continues working).
- **FCM** — MOCKED (counted but not sent).

## User Personas
- **Business Admin** — logs into the panel to manage their tenant's socios,
  send notifications, view stats.
- **End-Member (socio)** — scans tenant's QR, registers via public form,
  receives wallet pass + welcome points.

## What's Implemented (Apr 2026 — Phase 1 MVP)
### Backend (FastAPI · `/app/backend/server.py`)
- `GET /api/health`, `GET /api/`
- `GET /api/auth/me` — JWT validated, returns admin + tenant info
- `GET /api/dashboard/stats` — socios activos, notif this month, puntos emitidos, nivel distribution
- `GET /api/dashboard/recent-socios`, `GET /api/dashboard/recent-notifications`
- `GET /api/socios`, `GET /api/socios/:id` (with transacciones + pass)
- `POST /api/socios` — create socio (also seeds wallet pass record)
- `POST /api/socios/:id/puntos` — add manual points + transaccion record
- `GET /api/notificaciones`, `POST /api/notificaciones/send` (canal: wallet/fcm/ambos, optional socio_id)
- `GET /api/public/tenants/:slug` — public tenant branding
- `POST /api/public/registro/:slug` — public registration with 500 welcome points + pass + transaccion (tipo='registro')
- **NEW (Feb 2026):** `GET /api/tenant/card-config`, `PATCH /api/tenant/card-config` — card configurator endpoints; calls Railway `/passes/update-template` best-effort after save

### Frontend (React + Tailwind)
- `/login` — Supabase Auth login
- `/dashboard` — 4 stat cards, recent socios table, recent notifications, quick actions (new socio modal, send notification modal)
- `/socios` — list with search, nivel filter, sort, pagination, sumar puntos modal
- `/socios/:id` — profile card, points history, wallet pass status, sumar puntos & send notification actions
- `/notificaciones` — full list of sent notifications
- `/aliados` — Phase 2 placeholder
- `/configuracion` — tenant info, registro QR (download/copy/open)
- **NEW (Feb 2026):** `/configuracion-tarjeta` ("Mi tarjeta") — card configurator with live wallet-pass preview (color primary/secondary, logo upload, program name, geopush message+radius slider 50-500m, template selector PUNTOS/SELLOS/NIVELES/DESCUENTO), QR section with logo overlay
- `/registro/:tenant_slug` — PUBLIC branded registration with success state, 500 welcome puntos, "Añadir a Wallet" CTA

### Design System
- Dark theme (#0D0D1A background) + teal/blue gradient accents (#00E5A0 / #0EA5E9)
- Syne ExtraBold (headings) + DM Sans (body), Spanish UI throughout
- Custom `.gp-*` utility classes for cards/buttons/inputs/tables/nivel-pills

## Test Results
- **Backend** — 36/36 tests passing (26 regression + 10 new card-config), 100% pass
- **Frontend** — 100% of critical flows verified end-to-end (incl. Mi tarjeta)

## Schema additions
- **Feb 2026** — Added to `tenants`: `nombre_programa TEXT`, `mensaje_geopush TEXT`, `radio_geopush INTEGER DEFAULT 150`, `plantilla_fidelizacion TEXT DEFAULT 'puntos'`. Migration at `/app/backend/migrations/2026_02_card_config.sql` (applied to production Supabase).

## Known Notes
- FCM push delivery: **MOCKED** in Phase 1. Notifications are recorded in
  `notificaciones` with `total_enviadas` count but no real push is dispatched.
- Railway pass-generation service is NOT deployed yet — backend swallows
  errors so the user-facing flow always succeeds.
- Phase 1 uses `tipo` values: `push_manual` (broadcast/individual via FCM
  or both) and `wallet_update` (wallet-only).

## Backlog (Phase 2)
- P0: Wire Firebase Service Account Key for real FCM delivery
- P0: Build Railway pass-generation microservice (.pkpass + Google Wallet JWT)
- P1: Comercios aliados CRUD + map + geofencing push triggers
- P1: Retos system (challenges + progress tracking)
- P1: Analytics charts (engagement, conversion, points velocity)
- P2: Multi-tenant Umania Labs admin panel (manage tenants, plans)
- P2: Stripe billing integration
- P2: Custom branded domains per tenant
- P3: Tighten Supabase RLS policies (replace service_role bypass with proper
  policies on each table — eliminates need for backend service key)
- P3: Latency optimization — share a single supabase client with HTTP/1.1 (or
  switch to async client) instead of per-request instantiation

## Test Credentials
See `/app/memory/test_credentials.md`.

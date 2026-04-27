# GEOPASS™ — SCHEMA DEFINITIVO
# Versión 1.0 · Abril 2026 · Umania Labs
# ─────────────────────────────────────────────────────────
# REGLA DE ORO: Este archivo es la única fuente de verdad.
# Cualquier cambio en Supabase se refleja PRIMERO aquí.
# Pegar este archivo completo en cada prompt de Emergent
# que involucre base de datos.
# ─────────────────────────────────────────────────────────

---

## STACK

- **Base de datos:** Supabase (PostgreSQL)
- **Proyecto:** geopass-production
- **Auth:** Supabase Auth + JWT
- **RLS:** Row Level Security activado en TODAS las tablas
- **Convención de nombres:** snake_case en todo. Sin excepciones.

---

## TABLAS

---

### 1. tenants
El cliente de Umania Labs. Cada negocio o club que contrata GeoPass™ es un tenant.

```sql
CREATE TABLE tenants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_marca          TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,        -- ej: "gimnasio-elite"
  dominio_personalizado TEXT,                        -- ej: "fideliza.gimnasioelite.com"
  logo_url              TEXT,
  color_primario        TEXT DEFAULT '#00E5A0',      -- hex
  color_secundario      TEXT DEFAULT '#0EA5E9',      -- hex
  plan                  TEXT DEFAULT 'basic'         -- basic | pro | enterprise
                        CHECK (plan IN ('basic', 'pro', 'enterprise')),
  apple_pass_type_id    TEXT,                        -- com.umanialabs.geopass (shared) o propio
  google_issuer_id      TEXT,                        -- issuer ID de Google Wallet
  activo                BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now()
);
```

**Notas:**
- `slug` se usa para rutas y subdominios: `geopass.io/t/gimnasio-elite`
- Plan `basic` usa certificado Apple compartido de Umania Labs
- Plan `pro/enterprise` tiene `apple_pass_type_id` propio del cliente

---

### 2. usuarios_admin
Los usuarios del panel de control (propietarios del negocio o club, staff autorizado).

```sql
CREATE TABLE usuarios_admin (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email        TEXT NOT NULL UNIQUE,
  nombre       TEXT NOT NULL,
  rol          TEXT DEFAULT 'admin'
               CHECK (rol IN ('superadmin', 'admin', 'staff')),
  activo       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

**Notas:**
- `superadmin` = Umania Labs (acceso a todos los tenants)
- `admin` = propietario del negocio (acceso solo a su tenant via RLS)
- `staff` = empleado con acceso limitado (solo enviar mensajes, ver socios)

---

### 3. socios
Los clientes finales del negocio. Cada socio pertenece a un tenant.

```sql
CREATE TABLE socios (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre               TEXT NOT NULL,
  email                TEXT,
  telefono             TEXT,
  puntos               INTEGER DEFAULT 0,
  nivel                TEXT DEFAULT 'basico'
                       CHECK (nivel IN ('basico', 'bronce', 'plata', 'oro', 'vip')),
  wallet_pass_serial   TEXT UNIQUE,                  -- serial del PKPass
  push_token           TEXT,                         -- FCM token para web push
  activo               BOOLEAN DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now(),
  last_seen_at         TIMESTAMPTZ
);
```

**Notas:**
- `wallet_pass_serial` se genera al crear el pass y es único globalmente
- `push_token` se obtiene cuando el socio acepta notificaciones en el microsite
- `nivel` se recalcula automáticamente según `puntos` (trigger en Supabase)

**Reglas de nivel:**
```
basico:  0    - 499  pts
bronce:  500  - 1499 pts
plata:   1500 - 2999 pts
oro:     3000 - 5999 pts
vip:     6000+        pts
```

---

### 4. passes
Registro técnico de cada wallet pass generado. Uno por socio por tenant.

```sql
CREATE TABLE passes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  socio_id              UUID NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  serial_number         TEXT NOT NULL UNIQUE,        -- mismo que socios.wallet_pass_serial
  authentication_token  TEXT NOT NULL,               -- token para Apple push updates
  pass_type_id          TEXT NOT NULL,               -- Apple Pass Type ID
  last_updated          TIMESTAMPTZ DEFAULT now(),
  activo                BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now()
);
```

**Notas:**
- `authentication_token` es generado aleatoriamente al crear el pass
- Apple usa este token para autorizar actualizaciones del pass
- Cuando se actualizan los puntos del socio → se llama Railway → se actualiza el pass

---

### 5. comercios_aliados
Negocios asociados que pagan al tenant principal para aparecer en su red.
Aplica tanto a GeoPass™ (alianzas) como a ClubPass™ (red de comercios).

```sql
CREATE TABLE comercios_aliados (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre            TEXT NOT NULL,
  descripcion       TEXT,
  logo_url          TEXT,
  direccion         TEXT,
  lat               DECIMAL(10, 8),                  -- latitud
  lng               DECIMAL(11, 8),                  -- longitud
  radio_metros      INTEGER DEFAULT 150,             -- radio geopush en metros
  puntos_por_visita INTEGER DEFAULT 30,              -- puntos que suma una compra aquí
  horario_push_ini  TIME DEFAULT '09:00',            -- no enviar geopush antes de esta hora
  horario_push_fin  TIME DEFAULT '21:00',            -- no enviar geopush después de esta hora
  activo            BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now()
);
```

**Notas:**
- El tenant principal también tiene sus propias coordenadas en la tabla `tenants`
- Cada comercio aliado tiene su propio radio y horario configurable
- Para GeoPass™ básico (sin aliados), esta tabla está vacía para ese tenant

---

### 6. notificaciones
Registro de todos los mensajes push enviados desde el panel.

```sql
CREATE TABLE notificaciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  comercio_id     UUID REFERENCES comercios_aliados(id),  -- NULL = del tenant principal
  titulo          TEXT NOT NULL,
  mensaje         TEXT NOT NULL,
  tipo            TEXT NOT NULL
                  CHECK (tipo IN ('push_manual', 'geopush', 'wallet_update', 'campaña')),
  canal           TEXT NOT NULL
                  CHECK (canal IN ('wallet', 'fcm', 'ambos')),
  total_enviadas  INTEGER DEFAULT 0,
  total_abiertas  INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

### 7. transacciones_puntos
Historial completo de puntos ganados o canjeados por cada socio.

```sql
CREATE TABLE transacciones_puntos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  socio_id      UUID NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  comercio_id   UUID REFERENCES comercios_aliados(id),  -- NULL = acción del club/negocio
  tipo          TEXT NOT NULL
                CHECK (tipo IN (
                  'registro',
                  'visita',
                  'compra_aliado',
                  'reto_completado',
                  'cumpleanos',
                  'referido',
                  'renovacion',
                  'canje',
                  'manual'
                )),
  puntos        INTEGER NOT NULL,                   -- positivo = ganados, negativo = canjeados
  descripcion   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

---

### 8. retos (ClubPass™ — Nivel 2)
Retos mensuales o periódicos que el club define para sus socios.

```sql
CREATE TABLE retos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  titulo           TEXT NOT NULL,                   -- "Asiste 5 veces este mes"
  descripcion      TEXT,
  puntos_premio    INTEGER NOT NULL,
  tipo_accion      TEXT NOT NULL,                   -- "visita" | "compra_aliado" | etc.
  cantidad_requerida INTEGER NOT NULL,              -- cuántas veces hay que hacer la acción
  fecha_inicio     DATE NOT NULL,
  fecha_fin        DATE NOT NULL,
  activo           BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);
```

---

### 9. retos_progreso (ClubPass™ — Nivel 2)
Progreso de cada socio en cada reto activo.

```sql
CREATE TABLE retos_progreso (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reto_id      UUID NOT NULL REFERENCES retos(id) ON DELETE CASCADE,
  socio_id     UUID NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  progreso     INTEGER DEFAULT 0,                   -- cuántas veces ha cumplido la acción
  completado   BOOLEAN DEFAULT false,
  completado_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(reto_id, socio_id)
);
```

---

## ROW LEVEL SECURITY (RLS)

Activar en todas las tablas. Política base para cada una:

```sql
-- Ejemplo para tabla socios (aplicar patrón a todas las tablas)
ALTER TABLE socios ENABLE ROW LEVEL SECURITY;

-- Superadmin ve todo
CREATE POLICY "superadmin_all" ON socios
  FOR ALL USING (
    auth.jwt() ->> 'rol' = 'superadmin'
  );

-- Admin/staff solo ve su tenant
CREATE POLICY "tenant_isolation" ON socios
  FOR ALL USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  );
```

---

## ÍNDICES RECOMENDADOS

```sql
-- Socios
CREATE INDEX idx_socios_tenant ON socios(tenant_id);
CREATE INDEX idx_socios_wallet_serial ON socios(wallet_pass_serial);
CREATE INDEX idx_socios_push_token ON socios(push_token);

-- Transacciones
CREATE INDEX idx_transacciones_socio ON transacciones_puntos(socio_id);
CREATE INDEX idx_transacciones_tenant ON transacciones_puntos(tenant_id);

-- Notificaciones
CREATE INDEX idx_notificaciones_tenant ON notificaciones(tenant_id);

-- Comercios aliados
CREATE INDEX idx_comercios_tenant ON comercios_aliados(tenant_id);
```

---

## MICROSERVICIO RAILWAY — ENDPOINTS

El microservicio en Railway hace UNA SOLA COSA: generar y firmar wallet passes.
No tiene lógica de negocio. No crece en complejidad.

```
POST /passes/create
  Body: {
    tenant_id:     string,
    socio_id:      string,
    serial_number: string,
    nombre:        string,
    puntos:        number,
    nivel:         string,
    color_primario: string,
    logo_url:      string,
    nombre_marca:  string,
    pass_type_id:  string
  }
  Returns: .pkpass binary file

GET /passes/:serial_number
  Returns: .pkpass binary file (para re-descarga)

POST /passes/:serial_number/update
  Body: {
    puntos:  number,
    nivel:   string,
    mensaje: string   // opcional — aparece como notificación
  }
  Returns: { success: true }

GET /health
  Returns: { status: "ok", timestamp: ... }
```

---

## VARIABLES DE ENTORNO — RAILWAY

```env
# Apple Wallet
APPLE_PASS_TYPE_IDENTIFIER=pass.com.umanialabs.geopass
APPLE_TEAM_IDENTIFIER=XXXXXXXXXX        # de Apple Developer
APPLE_CERT_PATH=./certs/pass.pem
APPLE_KEY_PATH=./certs/pass.key
APPLE_WWDR_PATH=./certs/wwdr.pem

# Google Wallet
GOOGLE_SERVICE_ACCOUNT_EMAIL=geopass@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY=./certs/google-service-account.json
GOOGLE_ISSUER_ID=BCR2DN5T42T5H7J5

# Supabase
SUPABASE_URL=https://XXXX.supabase.co
SUPABASE_SERVICE_KEY=XXXX               # service_role key (no anon)

# Server
PORT=3001
NODE_ENV=production
JWT_SECRET=XXXX
```

---

## VARIABLES DE ENTORNO — EMERGENT (frontend + backend)

```env
SUPABASE_URL=https://XXXX.supabase.co
SUPABASE_ANON_KEY=XXXX
RAILWAY_API_URL=https://geopass-production.up.railway.app
FIREBASE_API_KEY=XXXX
FIREBASE_PROJECT_ID=geopass-umanialabs
```

---

## NOTAS IMPORTANTES PARA EMERGENT

1. **Siempre usar `tenant_id`** en todas las queries. Nunca hacer SELECT sin filtrar por tenant.
2. **Nunca usar camelCase** — todos los campos son snake_case.
3. **El nivel del socio** se calcula a partir de `puntos` — no se guarda como texto fijo, se recalcula en cada transacción.
4. **El microservicio Railway** solo se llama para crear/actualizar passes — toda la lógica de negocio va en Emergent.
5. **RLS de Supabase** garantiza aislamiento — pero el código también debe filtrar por `tenant_id` siempre.

---

*Schema v1.0 · GeoPass™ · Umania Labs · Abril 2026*
*Próxima revisión: cuando se active el Nivel 2 (microsite + retos)*

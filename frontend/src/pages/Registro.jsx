import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicApi } from "../lib/api";
import { CheckCircle2, AlertTriangle, Bell, BellOff } from "lucide-react";
import { getPushToken, listenForegroundMessages } from "../lib/firebase";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/* Convert base64 -> Uint8Array for a client-side Blob download. */
function base64ToBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* Official Apple "Add to Apple Wallet" badge — inline SVG. */
function AddToAppleWalletBadge() {
  return (
    <span className="inline-flex items-center gap-3 h-full">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="white"
        aria-hidden="true"
      >
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[0.6rem] uppercase tracking-[0.18em] opacity-80">
          Añadir a
        </span>
        <span className="text-[1.05rem] font-semibold">Apple Wallet</span>
      </span>
    </span>
  );
}

export default function Registro() {
  const { tenant_slug } = useParams();
  const [tenant, setTenant] = useState(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const [tenantError, setTenantError] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState("");
  /* push: 'idle' | 'requesting' | 'enabled' | 'denied' | 'unsupported' | 'error' */
  const [pushStatus, setPushStatus] = useState("idle");

  useEffect(() => {
    let active = true;
    publicApi
      .get(`/public/tenants/${tenant_slug}`)
      .then(({ data }) => active && setTenant(data))
      .catch(() => active && setTenantError("Esta tarjeta no existe o no está activa."))
      .finally(() => active && setLoadingTenant(false));
    return () => {
      active = false;
    };
  }, [tenant_slug]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await publicApi.post(`/public/registro/${tenant_slug}`, {
        nombre,
        email,
        telefono: telefono || null,
      });
      setSuccess(data);
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo completar el registro.");
    } finally {
      setBusy(false);
    }
  };

  const handleAddToWallet = () => {
    if (!success) return;
    if (success.pkpass_base64) {
      // In-memory direct download (no second network hop).
      const blob = new Blob([base64ToBuffer(success.pkpass_base64)], {
        type: "application/vnd.apple.pkpass",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `geopass-${success.socio_serial || "pass"}.pkpass`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } else if (success.pkpass_url) {
      // Fallback: backend endpoint re-generates via Railway.
      const absolute = `${BACKEND_URL}${success.pkpass_url}`;
      window.location.href = absolute;
    }
  };

  const handleEnablePush = async () => {
    if (!success?.socio_serial) return;
    setPushStatus("requesting");
    const { token, status } = await getPushToken();
    if (!token) {
      // Map permission states to UX-friendly statuses
      if (status === "denied") setPushStatus("denied");
      else if (status === "unsupported") setPushStatus("unsupported");
      else setPushStatus("error");
      return;
    }
    try {
      await publicApi.post("/public/push-token", {
        serial_number: success.socio_serial,
        push_token: token,
      });
      setPushStatus("enabled");
      // Start listening for foreground pushes so they don't get silently
      // dropped when the user is looking at this tab.
      listenForegroundMessages();
    } catch {
      setPushStatus("error");
    }
  };

  if (loadingTenant) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--gp-muted)]">
        Cargando…
      </div>
    );
  }

  if (tenantError || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="gp-card p-8 max-w-md text-center">
          <AlertTriangle className="text-[var(--gp-warning)] mx-auto mb-3" size={36} />
          <h1 className="text-2xl gp-display mb-2">Tarjeta no disponible</h1>
          <p className="text-sm text-[var(--gp-muted)]">{tenantError}</p>
        </div>
      </div>
    );
  }

  const primary = tenant.color_primario || "#00e5a0";
  const secondary = tenant.color_secundario || "#0ea5e9";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-5"
      style={{
        backgroundImage: `radial-gradient(circle at 20% 20%, ${primary}22, transparent 40%), radial-gradient(circle at 80% 80%, ${secondary}22, transparent 40%)`,
      }}
    >
      <div className="w-full max-w-md gp-fade-up">
        <div
          className="gp-card-elevated rounded-2xl overflow-hidden"
          style={{ borderColor: `${primary}40` }}
          data-testid="registro-card"
        >
          {/* Branded header */}
          <div
            className="p-6 text-[var(--gp-bg)] flex items-center gap-3"
            style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
          >
            {tenant.logo_url ? (
              <img
                src={tenant.logo_url}
                alt={tenant.nombre_marca}
                className="w-12 h-12 rounded-xl object-cover bg-white/30"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-white/25 flex items-center justify-center text-2xl gp-display">
                {tenant.nombre_marca.charAt(0)}
              </div>
            )}
            <div>
              <div className="text-xs uppercase tracking-widest opacity-80">
                Programa de socios
              </div>
              <div className="text-xl gp-display">{tenant.nombre_marca}</div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6">
            {success ? (
              <div
                className="flex flex-col items-center text-center"
                data-testid="registro-success"
              >
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                  style={{ background: `${primary}22`, color: primary }}
                >
                  <CheckCircle2 size={28} />
                </div>
                <h2 className="text-2xl gp-display mb-1">¡Bienvenido/a!</h2>
                <p className="text-sm text-[var(--gp-muted)]">
                  Te hemos sumado{" "}
                  <strong className="text-[var(--gp-text)]">
                    {success.puntos ?? 500} puntos
                  </strong>{" "}
                  de bienvenida.
                </p>

                <div
                  className="w-full mt-6 p-4 rounded-xl text-left"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${primary}33`,
                  }}
                >
                  <div className="text-xs uppercase tracking-wider text-[var(--gp-muted)] mb-1">
                    Tu tarjeta digital
                  </div>
                  <div className="font-medium">{success.socio_nombre}</div>
                  <div className="text-xs text-[var(--gp-muted)]">{success.socio_email}</div>
                  <div className="text-xs text-[var(--gp-muted)] mt-2 break-all">
                    Serial: {success.socio_serial}
                  </div>
                </div>

                {/* Apple Wallet badge — always shown; uses base64 if present,
                    otherwise falls back to /api/passes/:serial/download */}
                <button
                  onClick={handleAddToWallet}
                  className="mt-5 w-full h-14 rounded-xl bg-black text-white flex items-center justify-center gap-2 font-medium transition-transform hover:-translate-y-0.5 active:translate-y-0 shadow-[0_8px_24px_rgba(0,0,0,0.35)] border border-white/10"
                  data-testid="add-to-wallet"
                  aria-label="Añadir a Apple Wallet"
                >
                  <AddToAppleWalletBadge />
                </button>

                <p className="text-[0.7rem] text-[var(--gp-muted)] mt-3">
                  {success.pkpass_base64
                    ? "Tu tarjeta está lista. Abre el archivo para añadirla a tu Wallet."
                    : "Si la tarjeta no se descarga, vuelve a pulsar el botón en unos segundos."}
                </p>

                {/* Web Push opt-in */}
                <PushOptIn
                  status={pushStatus}
                  onEnable={handleEnablePush}
                  primary={primary}
                />
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4">
                <h2 className="text-2xl gp-display">Únete al club</h2>
                <p className="text-sm text-[var(--gp-muted)] -mt-2">
                  Completa tus datos y empieza a sumar puntos.
                </p>

                <div>
                  <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">
                    Nombre completo
                  </label>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                    className="gp-input mt-1"
                    data-testid="registro-nombre"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="gp-input mt-1"
                    data-testid="registro-email"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">
                    Teléfono <span className="opacity-60">(opcional)</span>
                  </label>
                  <input
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="gp-input mt-1"
                    data-testid="registro-telefono"
                  />
                </div>

                {error && (
                  <div
                    className="text-xs text-[var(--gp-error)]"
                    data-testid="registro-error"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full text-[var(--gp-bg)] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  style={{
                    background: `linear-gradient(135deg, ${primary}, ${secondary})`,
                  }}
                  data-testid="registro-submit"
                >
                  {busy ? "Creando tu tarjeta..." : "Crear mi tarjeta de socio"}
                </button>
                <p className="text-[0.7rem] text-[var(--gp-muted)] text-center">
                  Al registrarte recibirás <strong>500 puntos</strong> de bienvenida.
                </p>
              </form>
            )}
          </div>
        </div>
        <div className="text-center mt-5 text-xs text-[var(--gp-muted)]">
          Powered by <span className="gp-gradient-text font-semibold">GeoPass™</span> · Umania
          Labs
        </div>
      </div>
    </div>
  );
}

function PushOptIn({ status, onEnable, primary }) {
  if (status === "enabled") {
    return (
      <div
        className="mt-4 w-full p-3 rounded-xl flex items-center gap-2 text-sm"
        style={{ background: `${primary}14`, color: primary, border: `1px solid ${primary}40` }}
        data-testid="push-enabled"
      >
        <Bell size={16} />
        <span>Notificaciones activadas. Te avisaremos de promos y novedades.</span>
      </div>
    );
  }
  if (status === "denied") {
    return (
      <div
        className="mt-4 w-full p-3 rounded-xl flex items-center gap-2 text-sm text-[var(--gp-warning)]"
        style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)" }}
        data-testid="push-denied"
      >
        <BellOff size={16} />
        <span>
          Permiso denegado. Actívalo desde los ajustes del navegador si cambias de idea.
        </span>
      </div>
    );
  }
  if (status === "unsupported") {
    return (
      <p
        className="mt-4 text-[0.7rem] text-[var(--gp-muted)] text-center"
        data-testid="push-unsupported"
      >
        Las notificaciones web no están disponibles en este navegador.
      </p>
    );
  }
  return (
    <button
      onClick={onEnable}
      disabled={status === "requesting"}
      className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full border text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
      style={{ borderColor: primary, color: primary, background: "transparent" }}
      data-testid="enable-push-btn"
    >
      <Bell size={16} />
      {status === "requesting" ? "Pidiendo permiso..." : "Activar notificaciones"}
      {status === "error" && <span className="text-xs opacity-70">— reintentar</span>}
    </button>
  );
}

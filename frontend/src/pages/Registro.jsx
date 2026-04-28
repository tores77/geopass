import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicApi } from "../lib/api";
import { CheckCircle2, AlertTriangle, Smartphone } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center p-5"
         style={{
           backgroundImage: `radial-gradient(circle at 20% 20%, ${primary}22, transparent 40%), radial-gradient(circle at 80% 80%, ${secondary}22, transparent 40%)`,
         }}>
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
              <div className="flex flex-col items-center text-center" data-testid="registro-success">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                  style={{ background: `${primary}22`, color: primary }}
                >
                  <CheckCircle2 size={28} />
                </div>
                <h2 className="text-2xl gp-display mb-1">¡Bienvenido/a!</h2>
                <p className="text-sm text-[var(--gp-muted)]">
                  Te hemos sumado <strong className="text-[var(--gp-text)]">500 puntos</strong>{" "}
                  de bienvenida.
                </p>

                <div
                  className="w-full mt-6 p-4 rounded-xl text-left"
                  style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${primary}33` }}
                >
                  <div className="text-xs uppercase tracking-wider text-[var(--gp-muted)] mb-1">
                    Tu tarjeta digital
                  </div>
                  <div className="font-medium">{success.socio.nombre}</div>
                  <div className="text-xs text-[var(--gp-muted)]">{success.socio.email}</div>
                  <div className="text-xs text-[var(--gp-muted)] mt-2 break-all">
                    Serial: {success.socio.wallet_pass_serial}
                  </div>
                </div>

                <button
                  className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full text-[var(--gp-bg)] font-bold"
                  style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
                  data-testid="add-to-wallet"
                  onClick={() => alert("Tu .pkpass se enviará por email cuando esté listo.")}
                >
                  <Smartphone size={16} />
                  Añadir a Wallet
                </button>
                <p className="text-[0.7rem] text-[var(--gp-muted)] mt-3">
                  Tu tarjeta estará lista en breve. Te avisaremos por email.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4">
                <h2 className="text-2xl gp-display">Únete al club</h2>
                <p className="text-sm text-[var(--gp-muted)] -mt-2">
                  Completa tus datos y empieza a sumar puntos.
                </p>

                <div>
                  <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">Nombre completo</label>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                    className="gp-input mt-1"
                    data-testid="registro-nombre"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">Email</label>
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
                  <div className="text-xs text-[var(--gp-error)]" data-testid="registro-error">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full text-[var(--gp-bg)] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
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
          Powered by{" "}
          <span className="gp-gradient-text font-semibold">GeoPass™</span>{" "}
          · Umania Labs
        </div>
      </div>
    </div>
  );
}

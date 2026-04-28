import React, { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login, session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const loc = useLocation();
  const dest = loc.state?.from?.pathname || "/dashboard";

  useEffect(() => {
    if (!loading && session) navigate(dest, { replace: true });
  }, [session, loading, navigate, dest]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Sesión iniciada");
      navigate(dest, { replace: true });
    } catch (err) {
      const msg = err?.message || "";
      if (msg.toLowerCase().includes("invalid")) {
        toast.error("Credenciales incorrectas");
      } else {
        toast.error("No se pudo iniciar sesión");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-[#00e5a0]/12 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-[#0ea5e9]/10 blur-3xl" />
        </div>
        <div>
          <div className="text-4xl gp-display gp-gradient-text">GeoPass™</div>
          <div className="text-sm text-[var(--gp-muted)] tracking-wide mt-1">
            by Umania Labs
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-5xl xl:text-6xl gp-display leading-[1.05]">
            Tu tarjeta de fidelidad,
            <br />
            <span className="gp-gradient-text">en cada bolsillo.</span>
          </h1>
          <p className="text-[var(--gp-muted)] mt-6 text-base leading-relaxed">
            Plataforma white-label para que cualquier comercio lance su programa de socios
            con Apple Wallet, Google Wallet y geolocalización en minutos.
          </p>

          <div className="mt-10 flex flex-wrap gap-2">
            {[
              "Multi-tenant",
              "Apple Wallet + Google Wallet",
              "Push geolocalizado",
              "Programa de puntos",
            ].map((t) => (
              <span
                key={t}
                className="text-xs text-[var(--gp-muted)] px-3 py-1 rounded-full border border-[var(--gp-border)]"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="text-xs text-[var(--gp-muted)]">
          © {new Date().getFullYear()} Umania Labs · Fase 1 MVP
        </div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 text-center">
            <div className="text-3xl gp-display gp-gradient-text">GeoPass™</div>
            <div className="text-xs text-[var(--gp-muted)] tracking-wide">by Umania Labs</div>
          </div>

          <div className="gp-card p-8 gp-fade-up">
            <div className="flex items-center gap-2 text-[var(--gp-primary)] text-xs uppercase tracking-widest mb-3">
              <Sparkles size={14} />
              Panel del comercio
            </div>
            <h2 className="text-3xl gp-display mb-2">Iniciar sesión</h2>
            <p className="text-sm text-[var(--gp-muted)] mb-7">
              Accede al panel para gestionar tus socios y notificaciones.
            </p>

            <form onSubmit={submit} className="flex flex-col gap-4">
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
                  placeholder="tucorreo@empresa.com"
                  data-testid="login-email"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="gp-input mt-1"
                  placeholder="••••••••"
                  data-testid="login-password"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="gp-btn-primary mt-2 w-full"
                data-testid="login-submit"
              >
                {busy ? "Entrando..." : "Entrar al panel"}
              </button>
            </form>
          </div>

          <div className="text-center text-xs text-[var(--gp-muted)] mt-6">
            ¿Eres socio? Pide a tu comercio el QR para unirte.{" "}
            <Link to="/" className="text-[var(--gp-primary)] hover:underline">
              Saber más
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

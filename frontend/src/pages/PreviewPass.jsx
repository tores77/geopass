import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Smartphone, AlertCircle } from "lucide-react";

/**
 * Public preview-pass landing page.
 *
 * When an admin scans the QR shown in the "Vista previa en móvil" modal,
 * their iPhone lands here. We immediately trigger a download of the .pkpass
 * binary served by the backend — Safari recognises the MIME type and offers
 * to add the card to Apple Wallet.
 */
export default function PreviewPass() {
  const { tenant_slug } = useParams();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tenant_slug) return;
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/public/preview-pass/${encodeURIComponent(tenant_slug)}`;
    // Tiny delay so the user sees the "Abriendo..." message before the
    // Wallet prompt steals focus.
    const t = setTimeout(() => {
      try {
        window.location.href = url;
      } catch (e) {
        setError("No se pudo iniciar la descarga. Intenta abrir el enlace de nuevo.");
      }
    }, 600);
    // Fallback: if after 12s we're still on this page, the request likely
    // failed (Railway down, tenant inactive…). Show a manual link.
    const fallback = setTimeout(() => {
      setError("La generación está tardando más de lo normal. Toca el botón para reintentar.");
    }, 12000);
    return () => {
      clearTimeout(t);
      clearTimeout(fallback);
    };
  }, [tenant_slug]);

  const manualUrl = `${process.env.REACT_APP_BACKEND_URL}/api/public/preview-pass/${encodeURIComponent(tenant_slug || "")}`;

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="gp-card p-8 max-w-md w-full text-center gp-fade-up">
        <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center bg-[rgba(0,229,160,0.12)] border border-[var(--gp-primary)]/30 mb-5">
          <Smartphone size={26} className="text-[var(--gp-primary)]" />
        </div>
        <h1 className="text-2xl gp-display mb-2">
          Abriendo tu tarjeta en Apple Wallet…
        </h1>
        <p className="text-sm text-[var(--gp-muted)] mb-5">
          En un segundo te pediremos permiso para añadirla. Si no aparece,
          toca el botón.
        </p>

        {error ? (
          <div className="flex items-start gap-2 text-left bg-[rgba(255,80,80,0.08)] border border-[var(--gp-error)]/30 p-3 rounded-lg mb-4">
            <AlertCircle size={16} className="text-[var(--gp-error)] mt-0.5 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-[var(--gp-muted)] mb-5">
            <Loader2 size={16} className="animate-spin" /> Preparando vista previa…
          </div>
        )}

        <a
          href={manualUrl}
          className="gp-btn-primary inline-flex items-center gap-2"
          data-testid="preview-manual-link"
        >
          Añadir a Apple Wallet
        </a>

        <p className="text-[0.7rem] text-[var(--gp-muted)] mt-5">
          Esta es una <strong>vista previa temporal</strong>. No se guarda
          ningún dato.
        </p>
      </div>
    </div>
  );
}

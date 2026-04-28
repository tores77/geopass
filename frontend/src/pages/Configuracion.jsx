import React, { useRef } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import { QRCodeCanvas } from "qrcode.react";
import { Download, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function Configuracion() {
  const { profile } = useAuth();
  const qrRef = useRef(null);

  const slug = profile?.tenant?.slug;
  const url =
    typeof window !== "undefined" && slug
      ? `${window.location.origin}/registro/${slug}`
      : "";

  const downloadQR = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `geopass-${slug}-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  return (
    <Layout title="Configuración">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="gp-card p-6">
          <h3 className="text-lg gp-display mb-1">Información del tenant</h3>
          <p className="text-sm text-[var(--gp-muted)] mb-5">
            Datos de tu cuenta GeoPass™.
          </p>
          {profile && (
            <dl className="flex flex-col gap-3">
              <Row label="Marca" value={profile.tenant.nombre_marca} />
              <Row label="Slug" value={profile.tenant.slug} mono />
              <Row label="Plan" value={profile.tenant.plan} capitalize />
              <Row label="Color primario" value={profile.tenant.color_primario} swatch />
              <Row label="Color secundario" value={profile.tenant.color_secundario} swatch />
              <Row label="Tu rol" value={profile.rol} capitalize />
            </dl>
          )}
        </div>

        <div className="gp-card p-6">
          <h3 className="text-lg gp-display mb-1">Tu QR de registro</h3>
          <p className="text-sm text-[var(--gp-muted)] mb-5">
            Imprímelo en tu local. Cualquier persona puede escanearlo y darse de alta como
            socio.
          </p>

          {url ? (
            <div className="flex flex-col items-center">
              <div
                ref={qrRef}
                className="bg-white p-4 rounded-2xl"
                data-testid="registro-qr"
              >
                <QRCodeCanvas
                  value={url}
                  size={220}
                  fgColor="#0d0d1a"
                  bgColor="#ffffff"
                  level="M"
                />
              </div>
              <div className="text-xs text-[var(--gp-muted)] mt-3 break-all text-center">
                {url}
              </div>

              <div className="flex flex-wrap gap-2 mt-5">
                <button
                  onClick={downloadQR}
                  className="gp-btn-primary inline-flex items-center gap-1.5"
                  data-testid="qr-download"
                >
                  <Download size={15} /> Descargar QR
                </button>
                <button
                  onClick={copyLink}
                  className="gp-btn-secondary inline-flex items-center gap-1.5"
                  data-testid="qr-copy"
                >
                  <Copy size={14} /> Copiar enlace
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gp-btn-secondary inline-flex items-center gap-1.5"
                  data-testid="qr-open"
                >
                  <ExternalLink size={14} /> Abrir
                </a>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[var(--gp-muted)]">Cargando…</div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function Row({ label, value, mono, capitalize, swatch }) {
  return (
    <div className="flex justify-between items-center gap-4">
      <dt className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">{label}</dt>
      <dd
        className={`text-sm flex items-center gap-2 ${mono ? "font-mono" : ""} ${
          capitalize ? "capitalize" : ""
        }`}
      >
        {swatch && (
          <span
            className="w-4 h-4 rounded-full border border-[var(--gp-border)]"
            style={{ background: value }}
          />
        )}
        {value || "—"}
      </dd>
    </div>
  );
}

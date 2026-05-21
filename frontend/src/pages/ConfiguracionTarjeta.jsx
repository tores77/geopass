import React, { useEffect, useMemo, useRef, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { QRCodeCanvas } from "qrcode.react";
import {
  Upload,
  Save,
  Download,
  Copy,
  Wifi,
  CreditCard,
  Star,
  Stamp,
  Layers,
  Percent,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

const TEMPLATES = [
  { value: "puntos",    label: "Puntos",    sub: "Acumula por visita",  icon: Star },
  { value: "sellos",    label: "Sellos",    sub: "X sellos = premio",   icon: Stamp },
  { value: "niveles",   label: "Niveles",   sub: "Sube por gasto",      icon: Layers },
  { value: "descuento", label: "Descuento", sub: "% para socios",       icon: Percent },
];

const DEFAULT_CONFIG = {
  nombre_marca: "",
  slug: "",
  logo_url: null,
  color_primario: "#00E5A0",
  color_secundario: "#0EA5E9",
  nombre_programa: "Club de socios",
  mensaje_geopush: "",
  radio_geopush: 150,
  plantilla_fidelizacion: "puntos",
};

export default function ConfiguracionTarjeta() {
  const { refresh } = useAuth();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get("/tenant/card-config")
      .then(({ data }) => alive && setConfig({ ...DEFAULT_CONFIG, ...data }))
      .catch(() =>
        toast.error("No se pudo cargar la configuración de la tarjeta"),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const set = (patch) => setConfig((c) => ({ ...c, ...patch }));

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se admiten imágenes");
      return;
    }
    if (file.size > 500 * 1024) {
      toast.error("La imagen debe pesar menos de 500 KB");
      return;
    }
    setUploadingLogo(true);
    const reader = new FileReader();
    reader.onload = () => {
      set({ logo_url: reader.result });
      setUploadingLogo(false);
    };
    reader.onerror = () => {
      toast.error("No se pudo leer la imagen");
      setUploadingLogo(false);
    };
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const payload = {
        nombre_programa: config.nombre_programa,
        color_primario: config.color_primario,
        color_secundario: config.color_secundario,
        logo_url: config.logo_url,
        mensaje_geopush: config.mensaje_geopush,
        radio_geopush: config.radio_geopush,
        plantilla_fidelizacion: config.plantilla_fidelizacion,
      };
      const { data } = await api.patch("/tenant/card-config", payload);
      setConfig({ ...DEFAULT_CONFIG, ...data.config });
      await refresh();
      toast.success(
        "Tarjeta actualizada. Los cambios se verán en el Wallet de tus socios en unos minutos.",
      );
    } catch (e) {
      toast.error(
        e?.response?.data?.detail || "No se pudo guardar la configuración",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Mi tarjeta">
        <div className="flex items-center gap-2 text-[var(--gp-muted)]">
          <Loader2 className="animate-spin" size={16} /> Cargando…
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Mi tarjeta">
      <div className="flex flex-col gap-10">
        {/* SECTION 1 — DISEÑO DE LA TARJETA */}
        <section data-testid="section-diseno">
          <SectionHeader
            kicker="Sección 01"
            title="Diseño de la tarjeta"
            subtitle="Personaliza cómo verán tus socios la tarjeta en Apple Wallet. Los cambios se aplican en tiempo real al previsualizar."
          />

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-7 mt-6">
            {/* Preview (desktop: left, mobile: below form) */}
            <div className="order-2 lg:order-1">
              <div className="lg:sticky lg:top-24">
                <PassPreview config={config} />
                <p className="text-xs text-[var(--gp-muted)] mt-3 text-center">
                  Vista previa en tiempo real
                </p>
              </div>
            </div>

            {/* Form */}
            <div className="order-1 lg:order-2 gp-card p-6">
              <Field label="Nombre del programa" hint="Ej: Club de socios, Programa VIP">
                <input
                  data-testid="input-nombre-programa"
                  type="text"
                  className="gp-input"
                  maxLength={40}
                  value={config.nombre_programa || ""}
                  onChange={(e) => set({ nombre_programa: e.target.value })}
                  placeholder="Club de socios"
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                <Field label="Color primario" hint="Fondo de la tarjeta">
                  <ColorInput
                    testid="color-primario"
                    value={config.color_primario}
                    onChange={(v) => set({ color_primario: v })}
                  />
                </Field>
                <Field label="Color secundario" hint="Acento / etiquetas">
                  <ColorInput
                    testid="color-secundario"
                    value={config.color_secundario}
                    onChange={(v) => set({ color_secundario: v })}
                  />
                </Field>
              </div>

              <Field label="Logo del negocio" hint="PNG o SVG, máx 500 KB. Se muestra arriba a la izquierda en la tarjeta." className="mt-5">
                <LogoUploader
                  logoUrl={config.logo_url}
                  uploading={uploadingLogo}
                  onPick={handleLogoUpload}
                  onClear={() => set({ logo_url: null })}
                />
              </Field>

              <Field label="Mensaje de geopush" hint="Se envía cuando un socio entra al radio. Máx 60 caracteres." className="mt-5">
                <input
                  data-testid="input-mensaje-geopush"
                  type="text"
                  className="gp-input"
                  maxLength={60}
                  value={config.mensaje_geopush || ""}
                  onChange={(e) => set({ mensaje_geopush: e.target.value })}
                  placeholder="Te esperamos, tenemos mesa!"
                />
                <div className="text-[0.7rem] text-[var(--gp-muted)] mt-1 text-right">
                  {(config.mensaje_geopush || "").length}/60
                </div>
              </Field>

              <Field label="Radio de geopush" hint="Distancia desde el local para disparar la notificación." className="mt-2">
                <div className="flex items-center gap-4">
                  <input
                    data-testid="slider-radio-geopush"
                    type="range"
                    min={50}
                    max={500}
                    step={50}
                    value={config.radio_geopush || 150}
                    onChange={(e) => set({ radio_geopush: parseInt(e.target.value, 10) })}
                    className="gp-range flex-1"
                    style={{ "--gp-range-fill": `${(((config.radio_geopush || 150) - 50) / 450) * 100}%` }}
                  />
                  <span
                    className="text-sm font-mono font-semibold text-[var(--gp-primary)] min-w-[70px] text-right"
                    data-testid="radio-value"
                  >
                    {config.radio_geopush || 150} m
                  </span>
                </div>
              </Field>

              <Field label="Plantilla de fidelización" hint="Elige cómo recompensas a tus socios." className="mt-5">
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATES.map((t) => {
                    const active = config.plantilla_fidelizacion === t.value;
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.value}
                        data-testid={`template-${t.value}`}
                        type="button"
                        onClick={() => set({ plantilla_fidelizacion: t.value })}
                        className={`text-left rounded-xl p-3 border transition-all ${
                          active
                            ? "border-[var(--gp-primary)] bg-[rgba(0,229,160,0.06)]"
                            : "border-[var(--gp-border)] hover:border-[var(--gp-border-hover)]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon
                            size={15}
                            className={active ? "text-[var(--gp-primary)]" : "text-[var(--gp-muted)]"}
                          />
                          <span
                            className={`text-sm font-semibold uppercase tracking-wide ${
                              active ? "text-[var(--gp-primary)]" : "text-[var(--gp-text)]"
                            }`}
                          >
                            {t.label}
                          </span>
                        </div>
                        <div className="text-[0.7rem] text-[var(--gp-muted)] mt-1">
                          {t.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div className="flex justify-end mt-7 pt-5 border-t border-[var(--gp-border)]">
                <button
                  data-testid="btn-save-card"
                  onClick={onSave}
                  disabled={saving}
                  className="gp-btn-primary inline-flex items-center gap-2"
                >
                  {saving ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Save size={15} />
                  )}
                  {saving ? "Guardando…" : "Guardar y publicar"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2 — QR DE REGISTRO */}
        <section data-testid="section-qr">
          <SectionHeader
            kicker="Sección 02"
            title="QR de registro"
            subtitle="Imprime este QR y colócalo en tu local. Cualquier persona que lo escanee podrá darse de alta y recibir su tarjeta en Apple Wallet."
          />
          <QRSection config={config} />
        </section>
      </div>
    </Layout>
  );
}

/* ────────────────────────── Sub-components ────────────────────────── */

function SectionHeader({ kicker, title, subtitle }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.65rem] uppercase tracking-[0.18em] text-[var(--gp-primary)]">
        {kicker}
      </span>
      <h2 className="text-2xl gp-display">{title}</h2>
      <p className="text-sm text-[var(--gp-muted)] max-w-2xl">{subtitle}</p>
    </div>
  );
}

function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <div className="text-xs uppercase tracking-wider text-[var(--gp-muted)] mb-1">
        {label}
      </div>
      {children}
      {hint && (
        <div className="text-[0.7rem] text-[var(--gp-muted)] mt-1.5 opacity-80">
          {hint}
        </div>
      )}
    </label>
  );
}

function ColorInput({ value, onChange, testid }) {
  const v = value || "#000000";
  return (
    <div className="flex items-center gap-2">
      <label
        className="relative w-10 h-10 rounded-lg border border-[var(--gp-border)] cursor-pointer overflow-hidden shrink-0"
        style={{ background: v }}
        data-testid={`${testid}-swatch`}
      >
        <input
          type="color"
          value={v}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
          data-testid={`${testid}-picker`}
        />
      </label>
      <input
        type="text"
        value={v}
        onChange={(e) => onChange(e.target.value)}
        className="gp-input font-mono uppercase"
        maxLength={7}
        data-testid={`${testid}-hex`}
      />
    </div>
  );
}

function LogoUploader({ logoUrl, uploading, onPick, onClear }) {
  const ref = useRef(null);
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-16 h-16 rounded-xl border border-dashed border-[var(--gp-border)] bg-[var(--gp-card-elevated)] flex items-center justify-center overflow-hidden shrink-0"
        data-testid="logo-preview"
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="logo"
            className="w-full h-full object-contain"
          />
        ) : (
          <CreditCard size={20} className="text-[var(--gp-muted)]" />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="gp-btn-secondary inline-flex items-center gap-1.5 self-start"
          data-testid="btn-upload-logo"
        >
          {uploading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Upload size={13} />
          )}
          {logoUrl ? "Cambiar logo" : "Subir logo"}
        </button>
        {logoUrl && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-[var(--gp-muted)] hover:text-[var(--gp-error)] self-start"
            data-testid="btn-clear-logo"
          >
            Quitar logo
          </button>
        )}
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
          data-testid="input-logo-file"
        />
      </div>
    </div>
  );
}

/* ────────────────────────── Pass preview ────────────────────────── */

function PassPreview({ config }) {
  const primary = config.color_primario || "#00E5A0";
  const secondary = config.color_secundario || "#0EA5E9";
  const headerLabel = (config.plantilla_fidelizacion || "puntos").toUpperCase();
  const valueDisplay = useMemo(() => {
    switch (config.plantilla_fidelizacion) {
      case "sellos":    return { value: "7", label: "de 10 sellos" };
      case "niveles":   return { value: "Oro", label: "Nivel actual" };
      case "descuento": return { value: "15%", label: "Descuento socio" };
      default:          return { value: "1,250", label: "Puntos acumulados" };
    }
  }, [config.plantilla_fidelizacion]);

  // Detect if the chosen primary is light → flip text to dark for legibility.
  const textColor = isLight(primary) ? "#0d0d1a" : "#ffffff";
  const textMuted = isLight(primary) ? "rgba(13,13,26,0.55)" : "rgba(255,255,255,0.6)";

  return (
    <div className="flex justify-center">
      <div
        data-testid="pass-preview"
        className="w-full max-w-[340px] aspect-[1.586/2] rounded-[28px] p-5 flex flex-col justify-between shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] relative overflow-hidden transition-all duration-300"
        style={{
          background: `linear-gradient(155deg, ${primary} 0%, ${darken(primary, 0.15)} 100%)`,
          color: textColor,
        }}
      >
        {/* Subtle texture */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 80% 0%, rgba(255,255,255,0.15), transparent 50%)",
          }}
        />

        {/* Top row: logo + program name */}
        <div className="flex items-start justify-between relative">
          <div className="flex items-center gap-2.5 min-w-0">
            {config.logo_url ? (
              <img
                src={config.logo_url}
                alt="logo"
                className="w-10 h-10 rounded-lg object-contain bg-white/90 p-1"
                data-testid="preview-logo"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.15)" }}
              >
                <CreditCard size={18} style={{ color: textColor }} />
              </div>
            )}
            <div className="min-w-0">
              <div
                className="text-[0.65rem] uppercase tracking-wider truncate"
                style={{ color: textMuted }}
              >
                {config.nombre_programa || "Club de socios"}
              </div>
              <div
                className="text-base font-bold leading-tight truncate"
                style={{ color: textColor, fontFamily: "Syne, sans-serif" }}
                data-testid="preview-nombre-marca"
              >
                {config.nombre_marca || "Tu negocio"}
              </div>
            </div>
          </div>
          <Wifi size={16} style={{ color: textMuted, transform: "rotate(90deg)" }} />
        </div>

        {/* Middle: socio + value */}
        <div className="relative">
          <div
            className="text-[0.6rem] uppercase tracking-[0.16em] mb-1"
            style={{ color: secondary }}
            data-testid="preview-template-label"
          >
            {headerLabel}
          </div>
          <div
            className="text-[2.6rem] leading-none font-black tracking-tight"
            style={{ color: textColor, fontFamily: "Syne, sans-serif" }}
            data-testid="preview-value"
          >
            {valueDisplay.value}
          </div>
          <div
            className="text-xs mt-1"
            style={{ color: textMuted }}
          >
            {valueDisplay.label}
          </div>
        </div>

        {/* Bottom: socio name + serial */}
        <div className="relative flex items-end justify-between">
          <div>
            <div
              className="text-[0.6rem] uppercase tracking-wider"
              style={{ color: textMuted }}
            >
              Socio
            </div>
            <div
              className="text-sm font-semibold"
              style={{ color: textColor }}
            >
              Ana García
            </div>
          </div>
          <div className="text-right">
            <div
              className="text-[0.6rem] uppercase tracking-wider"
              style={{ color: textMuted }}
            >
              ID
            </div>
            <div
              className="text-xs font-mono"
              style={{ color: textColor }}
            >
              GP-•••872
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── QR section ────────────────────────── */

function QRSection({ config }) {
  const qrRef = useRef(null);
  const url =
    typeof window !== "undefined" && config.slug
      ? `${window.location.origin}/registro/${config.slug}`
      : "";

  const downloadQR = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `geopass-${config.slug}-qr.png`;
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

  if (!url) {
    return (
      <div className="text-sm text-[var(--gp-muted)] mt-4">Cargando…</div>
    );
  }

  return (
    <div className="gp-card p-7 mt-6 flex flex-col items-center">
      <div
        ref={qrRef}
        className="bg-white p-5 rounded-2xl"
        data-testid="qr-canvas-wrapper"
      >
        <QRCodeCanvas
          value={url}
          size={260}
          fgColor="#0d0d1a"
          bgColor="#ffffff"
          level="H"
          imageSettings={
            config.logo_url
              ? {
                  src: config.logo_url,
                  height: 50,
                  width: 50,
                  excavate: true,
                }
              : undefined
          }
        />
      </div>

      <div
        className="text-sm text-[var(--gp-muted)] mt-5 break-all text-center max-w-xl"
        data-testid="qr-url"
      >
        {url}
      </div>

      <div className="flex flex-wrap gap-2 mt-5 justify-center">
        <button
          onClick={downloadQR}
          className="gp-btn-primary inline-flex items-center gap-1.5"
          data-testid="btn-download-qr"
        >
          <Download size={15} /> Descargar QR
        </button>
        <button
          onClick={copyLink}
          className="gp-btn-secondary inline-flex items-center gap-1.5"
          data-testid="btn-copy-link"
        >
          <Copy size={14} /> Copiar enlace
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────── Color helpers ────────────────────────── */

function isLight(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  // Perceived luminance (per ITU BT.601).
  const lum = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return lum > 165;
}

function darken(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.max(0, Math.round(rgb.r * (1 - amount)));
  const g = Math.max(0, Math.round(rgb.g * (1 - amount)));
  const b = Math.max(0, Math.round(rgb.b * (1 - amount)));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return null;
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

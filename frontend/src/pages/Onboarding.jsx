import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { publicApi } from "../lib/api";
import { supabase } from "../lib/supabaseClient";
import {
  Sparkles,
  ArrowRight,
  Check,
  MapPin,
  Loader2,
  CreditCard,
  Wifi,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

/* ──────────────────────────── Static data ──────────────────────────── */

const TIPO_NEGOCIO = [
  "Restaurante",
  "Cafetería",
  "Gimnasio",
  "Peluquería",
  "Clínica",
  "Tienda",
  "Club deportivo",
  "Otro",
];

const PROGRAMA_SUGERENCIAS = [
  "Club de socios",
  "Programa VIP",
  "Clientes Premium",
];

const COLOR_PRESETS = [
  { hex: "#00E5A0", label: "Teal" },
  { hex: "#0EA5E9", label: "Azul" },
  { hex: "#8B5CF6", label: "Morado" },
  { hex: "#EF4444", label: "Rojo" },
  { hex: "#F97316", label: "Naranja" },
  { hex: "#EC4899", label: "Rosa" },
  { hex: "#F59E0B", label: "Oro" },
  { hex: "#1E293B", label: "Oscuro" },
];

const TOTAL_STEPS = 6;

const STEP_PROMPTS = {
  1: "Hola! Soy tu asistente de GeoPass. ¿Cómo se llama tu negocio?",
  2: "Perfecto! ¿Qué tipo de negocio tienes?",
  3: "¿Cómo quieres llamar a tu programa de fidelización?",
  4: "¿Qué color representa mejor tu negocio?",
  5: "¿Cuál es la dirección de tu local? La usamos para activar notificaciones automáticas cuando tus clientes pasen cerca.",
  6: "¡Todo listo! Crea tu cuenta para activar tu programa.",
};

/* ──────────────────────────── Component ──────────────────────────── */

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    nombre_marca: "",
    tipo_negocio: "",
    nombre_programa: "",
    color_primario: "#00E5A0",
    direccion: "",
    lat: null,
    lng: null,
    email: "",
    password: "",
  });
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const update = (patch) => setData((d) => ({ ...d, ...patch }));

  // After login on the same browser, skip onboarding.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => {
      if (s?.session) navigate("/dashboard", { replace: true });
    });
  }, [navigate]);

  // Friendly label for the user's previous answer in the chat history.
  const answerLabel = (n, d) => {
    switch (n) {
      case 1: return d.nombre_marca;
      case 2: return d.tipo_negocio;
      case 3: return d.nombre_programa;
      case 4: return d.color_primario;
      case 5: return d.direccion || "Ubicación detectada";
      default: return "";
    }
  };

  const advance = () => {
    setHistory((h) => [
      ...h,
      { question: STEP_PROMPTS[step], answer: answerLabel(step, data) },
    ]);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const canContinue = () => {
    switch (step) {
      case 1: return data.nombre_marca.trim().length >= 2;
      case 2: return !!data.tipo_negocio;
      case 3: return data.nombre_programa.trim().length >= 2;
      case 4: return /^#[0-9A-Fa-f]{6}$/.test(data.color_primario);
      case 5: return data.direccion.trim().length >= 4 || (data.lat && data.lng);
      case 6: return data.email.includes("@") && data.password.length >= 6;
      default: return false;
    }
  };

  const onLocate = () => {
    if (!navigator.geolocation) {
      toast.error("Tu navegador no permite geolocalización");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          direccion: data.direccion || "Ubicación detectada por GPS",
        });
        toast.success("Ubicación detectada");
        setLocating(false);
      },
      (err) => {
        toast.error("No se pudo obtener tu ubicación");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const onFinish = async () => {
    setBusy(true);
    try {
      const { data: res } = await publicApi.post("/public/onboarding", {
        nombre_marca: data.nombre_marca.trim(),
        tipo_negocio: data.tipo_negocio,
        nombre_programa: data.nombre_programa.trim(),
        color_primario: data.color_primario,
        direccion: data.direccion.trim() || null,
        lat: data.lat,
        lng: data.lng,
        email: data.email.trim().toLowerCase(),
        password: data.password,
      });
      // Auto sign-in so the user lands directly on /dashboard with session.
      try {
        await supabase.auth.signInWithPassword({
          email: data.email.trim().toLowerCase(),
          password: data.password,
        });
      } catch (e) {
        // If auto sign-in fails for any reason, fall back to /login.
        toast.success("Cuenta creada. Inicia sesión para continuar.");
        navigate("/login");
        return;
      }
      toast.success("¡Bienvenido a GeoPass!");
      navigate(res.redirect_url || "/dashboard", { replace: true });
    } catch (e) {
      const detail = e?.response?.data?.detail || "No se pudo crear tu cuenta";
      toast.error(detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 lg:px-12 py-5">
        <div>
          <div className="text-2xl gp-display gp-gradient-text">GeoPass™</div>
          <div className="text-[0.65rem] uppercase tracking-widest text-[var(--gp-muted)] mt-0.5">
            Asistente de alta
          </div>
        </div>
        <div className="text-xs text-[var(--gp-muted)] hidden sm:flex items-center gap-2">
          <Sparkles size={13} className="text-[var(--gp-primary)]" />
          Setup conversacional en menos de 10 min
        </div>
      </header>

      {/* Progress bar */}
      <div className="px-6 lg:px-12">
        <ProgressBar step={step} total={TOTAL_STEPS} />
      </div>

      {/* Main split */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 px-6 lg:px-12 py-8 lg:py-12">
        {/* Chat column */}
        <div className="flex flex-col min-w-0">
          {/* History bubbles */}
          <div className="flex flex-col gap-3 mb-4">
            {history.map((h, i) => (
              <ChatTurn key={i} question={h.question} answer={h.answer} step={i + 1} />
            ))}
          </div>

          {/* Current question + input */}
          <StepCard step={step}>
            <AgentBubble step={step} text={STEP_PROMPTS[step]} />
            <div className="mt-5 ml-9">
              {step === 1 && (
                <TextStep
                  testid="onb-nombre-marca"
                  value={data.nombre_marca}
                  onChange={(v) => update({ nombre_marca: v })}
                  placeholder="Mi Cafetería, Gym Olympus…"
                  maxLength={80}
                />
              )}
              {step === 2 && (
                <PillSelect
                  testid="onb-tipo-negocio"
                  options={TIPO_NEGOCIO}
                  value={data.tipo_negocio}
                  onChange={(v) => update({ tipo_negocio: v })}
                />
              )}
              {step === 3 && (
                <ProgramaStep
                  value={data.nombre_programa}
                  onChange={(v) => update({ nombre_programa: v })}
                />
              )}
              {step === 4 && (
                <ColorStep
                  value={data.color_primario}
                  onChange={(v) => update({ color_primario: v })}
                />
              )}
              {step === 5 && (
                <DireccionStep
                  data={data}
                  update={update}
                  locating={locating}
                  onLocate={onLocate}
                />
              )}
              {step === 6 && (
                <CuentaStep
                  data={data}
                  update={update}
                />
              )}

              {/* Continue / Finish */}
              <div className="mt-5 flex items-center gap-3">
                {step < TOTAL_STEPS ? (
                  <button
                    type="button"
                    data-testid="onb-continue"
                    disabled={!canContinue()}
                    onClick={advance}
                    className="gp-btn-primary inline-flex items-center gap-2"
                  >
                    Continuar <ArrowRight size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="onb-finish"
                    disabled={!canContinue() || busy}
                    onClick={onFinish}
                    className="gp-btn-primary inline-flex items-center gap-2"
                  >
                    {busy ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Check size={15} />
                    )}
                    {busy ? "Creando…" : "Crear mi cuenta y activar GeoPass"}
                  </button>
                )}
                <span className="text-[0.7rem] text-[var(--gp-muted)]">
                  Paso {step} de {TOTAL_STEPS}
                </span>
              </div>
            </div>
          </StepCard>

          <div className="text-xs text-[var(--gp-muted)] mt-8">
            ¿Ya tienes cuenta?{" "}
            <button
              type="button"
              className="text-[var(--gp-primary)] hover:underline"
              onClick={() => navigate("/login")}
              data-testid="onb-go-login"
            >
              Inicia sesión
            </button>
          </div>
        </div>

        {/* Preview column */}
        <div className="hidden lg:block">
          <div className="sticky top-10">
            <div className="text-xs uppercase tracking-widest text-[var(--gp-muted)] mb-3 text-center">
              Tu tarjeta — vista previa
            </div>
            <OnboardingPreview data={data} />
          </div>
        </div>

        {/* Mobile preview, only after step 4 (color) */}
        {step >= 4 && (
          <div className="lg:hidden">
            <div className="text-xs uppercase tracking-widest text-[var(--gp-muted)] mb-3 text-center">
              Tu tarjeta — vista previa
            </div>
            <OnboardingPreview data={data} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────── Step body components ──────────────────────────── */

function TextStep({ value, onChange, placeholder, maxLength, testid }) {
  return (
    <input
      type="text"
      data-testid={testid}
      className="gp-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      autoFocus
    />
  );
}

function PillSelect({ options, value, onChange, testid }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid={testid}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            data-testid={`${testid}-${opt.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
              active
                ? "border-[var(--gp-primary)] bg-[rgba(0,229,160,0.08)] text-[var(--gp-primary)]"
                : "border-[var(--gp-border)] text-[var(--gp-text)] hover:border-[var(--gp-border-hover)]"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function ProgramaStep({ value, onChange }) {
  return (
    <div>
      <input
        type="text"
        data-testid="onb-nombre-programa"
        className="gp-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Club de socios"
        maxLength={60}
        autoFocus
      />
      <div className="flex flex-wrap gap-2 mt-3">
        {PROGRAMA_SUGERENCIAS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            data-testid={`onb-programa-suggest-${s.toLowerCase().replace(/\s+/g, "-")}`}
            className="text-xs px-3 py-1.5 rounded-full border border-[var(--gp-border)] text-[var(--gp-muted)] hover:border-[var(--gp-primary)] hover:text-[var(--gp-primary)] transition-all"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorStep({ value, onChange }) {
  return (
    <div>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-4" data-testid="onb-color-presets">
        {COLOR_PRESETS.map((c) => {
          const active = value?.toUpperCase() === c.hex.toUpperCase();
          return (
            <button
              key={c.hex}
              type="button"
              onClick={() => onChange(c.hex)}
              title={c.label}
              data-testid={`onb-color-${c.hex.replace("#", "").toLowerCase()}`}
              className="aspect-square rounded-xl border transition-all relative"
              style={{
                background: c.hex,
                borderColor: active ? "#fff" : "rgba(255,255,255,0.12)",
                transform: active ? "scale(1.05)" : "scale(1)",
                boxShadow: active ? `0 8px 20px -6px ${c.hex}` : "none",
              }}
            >
              {active && (
                <Check
                  size={16}
                  className="absolute inset-0 m-auto"
                  style={{ color: isLight(c.hex) ? "#000" : "#fff" }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <label
          className="relative w-10 h-10 rounded-lg border border-[var(--gp-border)] overflow-hidden shrink-0 cursor-pointer"
          style={{ background: value }}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            data-testid="onb-color-picker"
          />
        </label>
        <input
          type="text"
          className="gp-input font-mono uppercase"
          maxLength={7}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid="onb-color-hex"
        />
      </div>
    </div>
  );
}

function DireccionStep({ data, update, locating, onLocate }) {
  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        data-testid="onb-direccion"
        className="gp-input"
        value={data.direccion}
        onChange={(e) => update({ direccion: e.target.value })}
        placeholder="Calle Mayor 12, Madrid"
        maxLength={200}
        autoFocus
      />
      <button
        type="button"
        onClick={onLocate}
        disabled={locating}
        data-testid="onb-locate"
        className="gp-btn-secondary inline-flex items-center justify-center gap-2 self-start"
      >
        {locating ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <MapPin size={14} />
        )}
        {locating ? "Detectando…" : "Usar mi ubicación actual"}
      </button>
      {data.lat && data.lng && (
        <div className="text-xs text-[var(--gp-primary)] inline-flex items-center gap-1.5">
          <Check size={12} /> Ubicación capturada ({data.lat.toFixed(4)},{" "}
          {data.lng.toFixed(4)})
        </div>
      )}
    </div>
  );
}

function CuentaStep({ data, update }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-[0.7rem] uppercase tracking-wider text-[var(--gp-muted)]">
          Email
        </label>
        <input
          type="email"
          data-testid="onb-email"
          className="gp-input mt-1"
          value={data.email}
          onChange={(e) => update({ email: e.target.value })}
          placeholder="tucorreo@empresa.com"
          autoComplete="email"
          autoFocus
        />
      </div>
      <div>
        <label className="text-[0.7rem] uppercase tracking-wider text-[var(--gp-muted)]">
          Contraseña
        </label>
        <input
          type="password"
          data-testid="onb-password"
          className="gp-input mt-1"
          value={data.password}
          onChange={(e) => update({ password: e.target.value })}
          placeholder="Mínimo 6 caracteres"
          autoComplete="new-password"
          minLength={6}
        />
      </div>
      <div className="flex items-start gap-2 text-[0.7rem] text-[var(--gp-muted)] mt-1">
        <AlertCircle size={12} className="mt-0.5 shrink-0" />
        Al continuar aceptas crear una cuenta de GeoPass™ para tu negocio.
      </div>
    </div>
  );
}

/* ──────────────────────────── Chrome ──────────────────────────── */

function ProgressBar({ step, total }) {
  const pct = (step / total) * 100;
  return (
    <div className="w-full">
      <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #00e5a0, #0ea5e9)",
          }}
          data-testid="onb-progress"
        />
      </div>
    </div>
  );
}

function AgentBubble({ step, text }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full bg-[rgba(0,229,160,0.12)] border border-[var(--gp-primary)]/30 flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles size={13} className="text-[var(--gp-primary)]" />
      </div>
      <div
        className="gp-card-elevated px-4 py-3 rounded-2xl rounded-tl-sm max-w-xl"
        data-testid={`onb-prompt-${step}`}
      >
        <p className="text-sm leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function UserBubble({ children }) {
  return (
    <div className="flex justify-end">
      <div
        className="px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-xs text-sm font-medium"
        style={{
          background: "linear-gradient(135deg, #00e5a0, #0ea5e9)",
          color: "#0d0d1a",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ChatTurn({ question, answer, step }) {
  return (
    <div className="flex flex-col gap-2 opacity-70">
      <AgentBubble step={`history-${step}`} text={question} />
      <UserBubble>{answer}</UserBubble>
    </div>
  );
}

function StepCard({ step, children }) {
  // The remount on step change re-triggers the gp-fade-up animation.
  return (
    <div key={step} className="gp-fade-up" data-testid={`onb-step-${step}`}>
      {children}
    </div>
  );
}

/* ──────────────────────────── Card preview ──────────────────────────── */

function OnboardingPreview({ data }) {
  const primary = data.color_primario || "#00E5A0";
  const headerLabel = "PUNTOS";
  const textColor = isLight(primary) ? "#0d0d1a" : "#ffffff";
  const textMuted = isLight(primary) ? "rgba(13,13,26,0.55)" : "rgba(255,255,255,0.6)";

  return (
    <div className="flex justify-center">
      <div
        data-testid="onb-pass-preview"
        className="w-full max-w-[340px] aspect-[1.586/2] rounded-[28px] p-5 flex flex-col justify-between shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] relative overflow-hidden transition-all duration-500"
        style={{
          background: `linear-gradient(155deg, ${primary} 0%, ${darken(primary, 0.15)} 100%)`,
          color: textColor,
        }}
      >
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 80% 0%, rgba(255,255,255,0.15), transparent 50%)",
          }}
        />

        <div className="flex items-start justify-between relative">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              <CreditCard size={18} style={{ color: textColor }} />
            </div>
            <div className="min-w-0">
              <div
                className="text-[0.65rem] uppercase tracking-wider truncate"
                style={{ color: textMuted }}
              >
                {data.nombre_programa || "Club de socios"}
              </div>
              <div
                className="text-base font-bold leading-tight truncate"
                style={{ color: textColor, fontFamily: "Syne, sans-serif" }}
                data-testid="onb-preview-marca"
              >
                {data.nombre_marca || "Tu negocio"}
              </div>
            </div>
          </div>
          <Wifi size={16} style={{ color: textMuted, transform: "rotate(90deg)" }} />
        </div>

        <div className="relative">
          <div
            className="text-[0.6rem] uppercase tracking-[0.16em] mb-1"
            style={{ color: textMuted }}
          >
            {headerLabel}
          </div>
          <div
            className="text-[2.6rem] leading-none font-black tracking-tight"
            style={{ color: textColor, fontFamily: "Syne, sans-serif" }}
          >
            1,250
          </div>
          <div className="text-xs mt-1" style={{ color: textMuted }}>
            Puntos acumulados
          </div>
        </div>

        <div className="relative flex items-end justify-between">
          <div>
            <div
              className="text-[0.6rem] uppercase tracking-wider"
              style={{ color: textMuted }}
            >
              Socio
            </div>
            <div className="text-sm font-semibold" style={{ color: textColor }}>
              Ana García
            </div>
          </div>
          <div className="text-right">
            <div
              className="text-[0.6rem] uppercase tracking-wider"
              style={{ color: textMuted }}
            >
              {data.tipo_negocio || "ID"}
            </div>
            <div className="text-xs font-mono" style={{ color: textColor }}>
              GP-•••872
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── Color helpers ──────────────────────────── */

function isLight(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
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
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

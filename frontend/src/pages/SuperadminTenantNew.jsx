import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SuperadminLayout from "../components/SuperadminLayout";
import { api } from "../lib/api";
import { toast } from "sonner";

const slugify = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

const PLANS = [
  { value: "basic", label: "Basic" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

export default function SuperadminTenantNew() {
  const [form, setForm] = useState({
    nombre_marca: "",
    slug: "",
    plan: "basic",
    color_primario: "#00E5A0",
    color_secundario: "#0EA5E9",
    lat: "",
    lng: "",
    logo_url: "",
    admin_email: "",
    admin_nombre: "",
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const update = (k, v) => {
    setForm((f) => {
      if (k === "nombre_marca" && !slugTouched) {
        return { ...f, nombre_marca: v, slug: slugify(v) };
      }
      return { ...f, [k]: v };
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        nombre_marca: form.nombre_marca.trim(),
        slug: form.slug.trim(),
        plan: form.plan,
        color_primario: form.color_primario,
        color_secundario: form.color_secundario,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null,
        logo_url: form.logo_url || null,
        admin_email: form.admin_email || null,
        admin_nombre: form.admin_nombre || null,
      };
      await api.post("/superadmin/tenants", payload);
      toast.success("Tenant creado correctamente");
      navigate("/superadmin");
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo crear el tenant");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SuperadminLayout
      title="Nuevo tenant"
      action={
        <Link
          to="/superadmin"
          className="text-sm text-[var(--gp-muted)] hover:text-[var(--gp-text)] inline-flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Volver
        </Link>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-5 max-w-5xl">
        <div className="gp-card p-6 lg:col-span-2 flex flex-col gap-4">
          <h3 className="text-lg gp-display">Información básica</h3>

          <Field label="Nombre de marca *">
            <input
              required
              value={form.nombre_marca}
              onChange={(e) => update("nombre_marca", e.target.value)}
              className="gp-input"
              data-testid="sa-form-nombre"
            />
          </Field>

          <Field label="Slug (URL pública) *" hint="Se usa en /registro/:slug. Debe ser único.">
            <input
              required
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                update("slug", slugify(e.target.value));
              }}
              className="gp-input font-mono"
              data-testid="sa-form-slug"
            />
          </Field>

          <Field label="Plan *">
            <div className="flex gap-2">
              {PLANS.map((p) => (
                <button
                  type="button"
                  key={p.value}
                  onClick={() => update("plan", p.value)}
                  data-testid={`sa-form-plan-${p.value}`}
                  className={`px-4 py-2 rounded-full text-xs font-medium border transition-all flex-1 ${
                    form.plan === p.value
                      ? "border-[var(--gp-primary)] text-[var(--gp-primary)] bg-[rgba(0,229,160,0.08)]"
                      : "border-[var(--gp-border)] text-[var(--gp-muted)] hover:text-[var(--gp-text)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="URL del logo (opcional)">
            <input
              value={form.logo_url}
              onChange={(e) => update("logo_url", e.target.value)}
              className="gp-input"
              placeholder="https://..."
              data-testid="sa-form-logo"
            />
          </Field>

          <h3 className="text-lg gp-display mt-3">Geopush (opcional)</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitud">
              <input
                type="number"
                step="any"
                value={form.lat}
                onChange={(e) => update("lat", e.target.value)}
                className="gp-input"
                placeholder="Ej. 41.3851"
                data-testid="sa-form-lat"
              />
            </Field>
            <Field label="Longitud">
              <input
                type="number"
                step="any"
                value={form.lng}
                onChange={(e) => update("lng", e.target.value)}
                className="gp-input"
                placeholder="Ej. 2.1734"
                data-testid="sa-form-lng"
              />
            </Field>
          </div>

          <h3 className="text-lg gp-display mt-3">Admin inicial (opcional)</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email del admin">
              <input
                type="email"
                value={form.admin_email}
                onChange={(e) => update("admin_email", e.target.value)}
                className="gp-input"
                data-testid="sa-form-admin-email"
              />
            </Field>
            <Field label="Nombre del admin">
              <input
                value={form.admin_nombre}
                onChange={(e) => update("admin_nombre", e.target.value)}
                className="gp-input"
                data-testid="sa-form-admin-nombre"
              />
            </Field>
          </div>
          <p className="text-[0.7rem] text-[var(--gp-muted)] -mt-2">
            Si lo rellenas se crea un registro en{" "}
            <code className="text-[var(--gp-primary)]">usuarios_admin</code> con rol{" "}
            <code className="text-[var(--gp-primary)]">admin</code>. Recuerda crear también
            su cuenta en Supabase Auth con el mismo email.
          </p>
        </div>

        <div className="gp-card p-6 flex flex-col gap-4">
          <h3 className="text-lg gp-display">Branding</h3>

          <Field label="Color primario">
            <ColorRow
              value={form.color_primario}
              onChange={(v) => update("color_primario", v)}
              testid="sa-form-color1"
            />
          </Field>
          <Field label="Color secundario">
            <ColorRow
              value={form.color_secundario}
              onChange={(v) => update("color_secundario", v)}
              testid="sa-form-color2"
            />
          </Field>

          <div className="mt-2">
            <div className="text-[0.65rem] uppercase tracking-wider text-[var(--gp-muted)] mb-2">
              Vista previa
            </div>
            <div
              className="rounded-2xl p-5 text-[var(--gp-bg)]"
              style={{
                background: `linear-gradient(135deg, ${form.color_primario}, ${form.color_secundario})`,
              }}
            >
              <div className="text-xs uppercase tracking-widest opacity-80">
                Programa de socios
              </div>
              <div className="text-lg gp-display">
                {form.nombre_marca || "Tu marca"}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || !form.nombre_marca || !form.slug}
            className="gp-btn-primary w-full mt-3"
            data-testid="sa-form-submit"
          >
            {busy ? "Creando..." : "Crear tenant"}
          </button>
        </div>
      </form>
    </SuperadminLayout>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <div className="text-[0.65rem] text-[var(--gp-muted)] mt-1">{hint}</div>}
    </div>
  );
}

function ColorRow({ value, onChange, testid }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border border-[var(--gp-border)]"
        data-testid={`${testid}-picker`}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="gp-input font-mono"
        data-testid={`${testid}-text`}
      />
    </div>
  );
}

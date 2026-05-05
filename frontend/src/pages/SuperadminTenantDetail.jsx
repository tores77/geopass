import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Eye, Save, Power, Trash2, Users, Coins, Bell } from "lucide-react";
import SuperadminLayout from "../components/SuperadminLayout";
import PlanBadge from "../components/PlanBadge";
import NivelBadge from "../components/NivelBadge";
import Modal from "../components/Modal";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

const PLANS = ["basic", "pro", "enterprise"];

export default function SuperadminTenantDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();
  const { impersonate } = useAuth();

  const load = async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/superadmin/tenants/${id}`);
      setData(d);
      setForm({
        nombre_marca: d.tenant.nombre_marca || "",
        slug: d.tenant.slug || "",
        plan: d.tenant.plan || "basic",
        color_primario: d.tenant.color_primario || "#00E5A0",
        color_secundario: d.tenant.color_secundario || "#0EA5E9",
        lat: d.tenant.lat ?? "",
        lng: d.tenant.lng ?? "",
        logo_url: d.tenant.logo_url || "",
      });
    } catch (e) {
      toast.error("No se pudo cargar el tenant");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [id]);

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const payload = {
        nombre_marca: form.nombre_marca,
        slug: form.slug,
        plan: form.plan,
        color_primario: form.color_primario,
        color_secundario: form.color_secundario,
        lat: form.lat === "" ? null : parseFloat(form.lat),
        lng: form.lng === "" ? null : parseFloat(form.lng),
        logo_url: form.logo_url || null,
      };
      await api.patch(`/superadmin/tenants/${id}`, payload);
      toast.success("Cambios guardados");
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    try {
      await api.post(`/superadmin/tenants/${id}/deactivate`);
      toast.success("Tenant desactivado");
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo desactivar");
    } finally {
      setBusy(false);
    }
  };

  const reallyDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/superadmin/tenants/${id}`);
      toast.success("Tenant eliminado");
      navigate("/superadmin");
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo eliminar");
      setBusy(false);
    }
  };

  const goImpersonate = async () => {
    await impersonate(id);
    toast.success(`Accediendo como ${data.tenant.nombre_marca}`);
    navigate("/dashboard");
  };

  if (loading || !data || !form) {
    return (
      <SuperadminLayout title="Tenant">
        <div className="text-sm text-[var(--gp-muted)]">Cargando…</div>
      </SuperadminLayout>
    );
  }

  const t = data.tenant;
  const stats = data.stats;

  return (
    <SuperadminLayout
      title={t.nombre_marca}
      action={
        <Link
          to="/superadmin"
          className="text-sm text-[var(--gp-muted)] hover:text-[var(--gp-text)] inline-flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Volver
        </Link>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Socios activos" value={stats.socios_count} />
        <StatCard
          icon={Coins}
          label="Puntos emitidos"
          value={(stats.puntos_emitidos || 0).toLocaleString("es-ES")}
          accent="primary"
        />
        <StatCard
          icon={Bell}
          label="Notificaciones"
          value={stats.notificaciones_count}
          accent="secondary"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3 text-sm text-[var(--gp-muted)]">
        <PlanBadge plan={t.plan} />
        <span>·</span>
        <span>
          Estado: {t.activo ? (
            <span className="text-[var(--gp-primary)]">activo</span>
          ) : (
            <span className="text-[var(--gp-error)]">inactivo</span>
          )}
        </span>
        <span>·</span>
        <span>Alta: {new Date(t.created_at).toLocaleDateString("es-ES")}</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-6">
        {/* Edit form */}
        <form onSubmit={save} className="gp-card p-6 xl:col-span-2 flex flex-col gap-4">
          <h3 className="text-lg gp-display">Editar tenant</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nombre de marca">
              <input
                value={form.nombre_marca}
                onChange={(e) => setForm({ ...form, nombre_marca: e.target.value })}
                className="gp-input"
                data-testid="sa-edit-nombre"
              />
            </Field>
            <Field label="Slug">
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                className="gp-input font-mono"
                data-testid="sa-edit-slug"
              />
            </Field>
          </div>

          <Field label="Plan">
            <div className="flex gap-2">
              {PLANS.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setForm({ ...form, plan: p })}
                  className={`flex-1 px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                    form.plan === p
                      ? "border-[var(--gp-primary)] text-[var(--gp-primary)] bg-[rgba(0,229,160,0.08)]"
                      : "border-[var(--gp-border)] text-[var(--gp-muted)] hover:text-[var(--gp-text)]"
                  }`}
                  data-testid={`sa-edit-plan-${p}`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Color primario">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color_primario}
                  onChange={(e) => setForm({ ...form, color_primario: e.target.value })}
                  className="w-12 h-10 rounded-lg cursor-pointer bg-transparent border border-[var(--gp-border)]"
                />
                <input
                  value={form.color_primario}
                  onChange={(e) => setForm({ ...form, color_primario: e.target.value })}
                  className="gp-input font-mono"
                />
              </div>
            </Field>
            <Field label="Color secundario">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color_secundario}
                  onChange={(e) => setForm({ ...form, color_secundario: e.target.value })}
                  className="w-12 h-10 rounded-lg cursor-pointer bg-transparent border border-[var(--gp-border)]"
                />
                <input
                  value={form.color_secundario}
                  onChange={(e) => setForm({ ...form, color_secundario: e.target.value })}
                  className="gp-input font-mono"
                />
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Latitud">
              <input
                type="number"
                step="any"
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
                className="gp-input"
                data-testid="sa-edit-lat"
              />
            </Field>
            <Field label="Longitud">
              <input
                type="number"
                step="any"
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })}
                className="gp-input"
                data-testid="sa-edit-lng"
              />
            </Field>
          </div>

          <Field label="URL del logo">
            <input
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              className="gp-input"
              placeholder="https://..."
            />
          </Field>

          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--gp-border)]">
            <button
              type="submit"
              disabled={busy}
              className="gp-btn-primary inline-flex items-center gap-1.5"
              data-testid="sa-edit-save"
            >
              <Save size={15} /> Guardar cambios
            </button>
            <button
              type="button"
              onClick={goImpersonate}
              className="gp-btn-secondary inline-flex items-center gap-1.5"
              data-testid="sa-edit-impersonate"
            >
              <Eye size={14} /> Acceder como este tenant
            </button>
            {t.activo && (
              <button
                type="button"
                onClick={deactivate}
                disabled={busy}
                className="px-4 py-2 rounded-full text-xs font-medium border border-[var(--gp-warning)] text-[var(--gp-warning)] hover:bg-[rgba(245,158,11,0.08)] inline-flex items-center gap-1.5"
                data-testid="sa-edit-deactivate"
              >
                <Power size={14} /> Desactivar tenant
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 rounded-full text-xs font-medium border border-[var(--gp-error)] text-[var(--gp-error)] hover:bg-[rgba(255,80,80,0.08)] inline-flex items-center gap-1.5"
              data-testid="sa-edit-delete"
            >
              <Trash2 size={14} /> Eliminar tenant
            </button>
          </div>
        </form>

        {/* Recent socios */}
        <div className="gp-card p-6">
          <h3 className="text-lg gp-display mb-3">Socios recientes</h3>
          {data.recent_socios.length === 0 ? (
            <div className="text-sm text-[var(--gp-muted)] py-8 text-center">
              Sin socios todavía.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.recent_socios.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start justify-between gap-3 p-2 rounded-lg hover:bg-white/[0.02]"
                  data-testid={`sa-recent-${s.id}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{s.nombre}</div>
                    <div className="text-xs text-[var(--gp-muted)] truncate">{s.email}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <NivelBadge nivel={s.nivel} />
                    <span className="text-xs text-[var(--gp-muted)]">{s.puntos} pts</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {data.admins?.length > 0 && (
            <div className="mt-6">
              <div className="text-[0.65rem] uppercase tracking-wider text-[var(--gp-muted)] mb-2">
                Admins de este tenant
              </div>
              <ul className="flex flex-col gap-1.5">
                {data.admins.map((a) => (
                  <li
                    key={a.id}
                    className="text-xs text-[var(--gp-muted)] flex items-center justify-between"
                  >
                    <span>{a.nombre}</span>
                    <span className="font-mono">{a.rol}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="¿Eliminar tenant?"
        testid="sa-confirm-delete-modal"
      >
        <p className="text-sm text-[var(--gp-muted)]">
          Esta acción <strong className="text-[var(--gp-error)]">no se puede deshacer</strong>.
          Se eliminarán de forma permanente:
        </p>
        <ul className="text-sm text-[var(--gp-muted)] mt-3 list-disc pl-6 space-y-1">
          <li>El tenant <strong className="text-[var(--gp-text)]">{t.nombre_marca}</strong></li>
          <li>{stats.socios_count} socios y todas sus transacciones</li>
          <li>{stats.notificaciones_count} notificaciones enviadas</li>
          <li>Los wallet passes y comercios aliados asociados</li>
        </ul>
        <div className="flex justify-end gap-3 pt-5 mt-3 border-t border-[var(--gp-border)]">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="gp-btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={reallyDelete}
            disabled={busy}
            className="px-5 py-2 rounded-full text-sm font-bold bg-[var(--gp-error)] text-white hover:opacity-90 disabled:opacity-50"
            data-testid="sa-confirm-delete-btn"
          >
            {busy ? "Eliminando..." : "Sí, eliminar para siempre"}
          </button>
        </div>
      </Modal>
    </SuperadminLayout>
  );
}

function StatCard({ icon: Icon, label, value, accent = "primary" }) {
  return (
    <div className="gp-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[0.7rem] text-[var(--gp-muted)] uppercase tracking-wider">
            {label}
          </div>
          <div className="mt-2 text-3xl gp-display">{value}</div>
        </div>
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            accent === "primary"
              ? "bg-[rgba(0,229,160,0.12)] text-[var(--gp-primary)]"
              : "bg-[rgba(14,165,233,0.12)] text-[var(--gp-secondary)]"
          }`}
        >
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

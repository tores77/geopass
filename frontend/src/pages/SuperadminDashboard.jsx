import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Eye, Pencil, Building, Users, Bell } from "lucide-react";
import SuperadminLayout from "../components/SuperadminLayout";
import PlanBadge from "../components/PlanBadge";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

const StatCard = ({ icon: Icon, label, value, accent = "primary", testid }) => (
  <div className="gp-card p-5" data-testid={testid}>
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
            : accent === "secondary"
            ? "bg-[rgba(14,165,233,0.12)] text-[var(--gp-secondary)]"
            : "bg-[rgba(255,80,80,0.12)] text-[#FF5050]"
        }`}
      >
        <Icon size={18} />
      </div>
    </div>
  </div>
);

export default function SuperadminDashboard() {
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const navigate = useNavigate();
  const { impersonate } = useAuth();

  const load = async () => {
    setLoading(true);
    const safe = (p) => p.then((r) => r.data).catch(() => null);
    const [s, t] = await Promise.all([
      safe(api.get("/superadmin/stats")),
      safe(api.get("/superadmin/tenants")),
    ]);
    setStats(s);
    setTenants(t || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleActivo = async (tenant) => {
    setBusyId(tenant.id);
    try {
      await api.patch(`/superadmin/tenants/${tenant.id}`, { activo: !tenant.activo });
      toast.success(`Tenant ${tenant.activo ? "desactivado" : "activado"}`);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo actualizar");
    } finally {
      setBusyId(null);
    }
  };

  const goImpersonate = async (tenant) => {
    await impersonate(tenant.id);
    toast.success(`Accediendo como ${tenant.nombre_marca}`);
    navigate("/dashboard");
  };

  return (
    <SuperadminLayout
      title="Panel Superadmin"
      action={
        <Link
          to="/superadmin/tenants/new"
          className="gp-btn-primary inline-flex items-center gap-1.5"
          data-testid="sa-new-tenant"
        >
          <Plus size={16} /> Nuevo tenant
        </Link>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Building}
          label="Tenants activos"
          value={loading ? "—" : stats?.tenants_activos ?? 0}
          accent="error"
          testid="sa-stat-tenants"
        />
        <StatCard
          icon={Users}
          label="Socios totales"
          value={loading ? "—" : (stats?.socios_total ?? 0).toLocaleString("es-ES")}
          testid="sa-stat-socios"
        />
        <StatCard
          icon={Bell}
          label="Notif. este mes"
          value={loading ? "—" : stats?.notificaciones_mes ?? 0}
          accent="secondary"
          testid="sa-stat-notif"
        />
      </div>

      <div className="gp-card p-5 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg gp-display">Todos los tenants</h3>
          <span className="text-xs text-[var(--gp-muted)]">{tenants.length} en total</span>
        </div>

        {loading ? (
          <div className="text-sm text-[var(--gp-muted)] py-8 text-center">Cargando…</div>
        ) : tenants.length === 0 ? (
          <div className="text-sm text-[var(--gp-muted)] py-12 text-center">
            Aún no hay tenants. Crea el primero arriba a la derecha.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="gp-table">
              <thead>
                <tr>
                  <th>Marca</th>
                  <th>Slug</th>
                  <th>Plan</th>
                  <th>Socios</th>
                  <th>Activo</th>
                  <th>Alta</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} data-testid={`sa-tenant-row-${t.id}`}>
                    <td className="font-medium">{t.nombre_marca}</td>
                    <td className="font-mono text-xs text-[var(--gp-muted)]">{t.slug}</td>
                    <td><PlanBadge plan={t.plan} /></td>
                    <td>{t.socios_count ?? 0}</td>
                    <td>
                      <button
                        onClick={() => toggleActivo(t)}
                        disabled={busyId === t.id}
                        className="relative inline-block w-10 h-5 rounded-full transition-colors disabled:opacity-50"
                        style={{
                          background: t.activo ? "var(--gp-primary)" : "rgba(255,255,255,0.1)",
                        }}
                        data-testid={`sa-toggle-${t.id}`}
                        aria-label={t.activo ? "Desactivar" : "Activar"}
                      >
                        <span
                          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                          style={{ transform: t.activo ? "translateX(22px)" : "translateX(2px)" }}
                        />
                      </button>
                    </td>
                    <td className="text-xs text-[var(--gp-muted)]">
                      {new Date(t.created_at).toLocaleDateString("es-ES")}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => goImpersonate(t)}
                          className="text-xs text-[var(--gp-primary)] hover:underline inline-flex items-center gap-1"
                          data-testid={`sa-impersonate-${t.id}`}
                        >
                          <Eye size={12} /> Ver panel
                        </button>
                        <Link
                          to={`/superadmin/tenants/${t.id}`}
                          className="text-xs text-[var(--gp-secondary)] hover:underline inline-flex items-center gap-1"
                          data-testid={`sa-edit-${t.id}`}
                        >
                          <Pencil size={12} /> Editar
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SuperadminLayout>
  );
}

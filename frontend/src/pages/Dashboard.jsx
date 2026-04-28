import React, { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import {
  Users,
  Bell,
  Coins,
  TrendingUp,
  UserPlus,
  Send,
  ArrowRight,
} from "lucide-react";
import NivelBadge from "../components/NivelBadge";
import AddSocioModal from "../components/AddSocioModal";
import SendNotificationModal from "../components/SendNotificationModal";

const StatCard = ({ icon: Icon, label, value, sub, accent = "primary", testid }) => (
  <div className="gp-card p-5" data-testid={testid}>
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[0.7rem] text-[var(--gp-muted)] uppercase tracking-wider">
          {label}
        </div>
        <div className="mt-2 text-3xl gp-display">{value}</div>
        {sub && <div className="text-xs text-[var(--gp-muted)] mt-1">{sub}</div>}
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

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentSocios, setRecentSocios] = useState([]);
  const [recentNotifs, setRecentNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openSocio, setOpenSocio] = useState(false);
  const [openNotif, setOpenNotif] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, rs, rn] = await Promise.all([
        api.get("/dashboard/stats"),
        api.get("/dashboard/recent-socios"),
        api.get("/dashboard/recent-notifications"),
      ]);
      setStats(s.data);
      setRecentSocios(rs.data);
      setRecentNotifs(rn.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Layout
      title="Dashboard"
      action={
        <div className="hidden md:flex gap-2">
          <button
            onClick={() => setOpenSocio(true)}
            className="gp-btn-secondary inline-flex items-center gap-1.5"
            data-testid="quick-add-socio"
          >
            <UserPlus size={15} /> Nuevo socio
          </button>
          <button
            onClick={() => setOpenNotif(true)}
            className="gp-btn-primary inline-flex items-center gap-1.5"
            data-testid="quick-send-notif"
          >
            <Send size={15} /> Enviar mensaje
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          testid="stat-socios"
          icon={Users}
          label="Socios activos"
          value={loading ? "—" : stats?.socios_activos ?? 0}
          sub="Total de miembros activos"
        />
        <StatCard
          testid="stat-notifs"
          icon={Bell}
          label="Notif. este mes"
          value={loading ? "—" : stats?.notificaciones_mes ?? 0}
          accent="secondary"
          sub="Enviadas este mes"
        />
        <StatCard
          testid="stat-puntos"
          icon={Coins}
          label="Puntos emitidos"
          value={
            loading
              ? "—"
              : (stats?.puntos_emitidos ?? 0).toLocaleString("es-ES")
          }
          sub="Acumulado total"
        />
        <div className="gp-card p-5" data-testid="stat-niveles">
          <div className="text-[0.7rem] text-[var(--gp-muted)] uppercase tracking-wider">
            Distribución por nivel
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {loading || !stats ? (
              <span className="text-sm text-[var(--gp-muted)]">Cargando…</span>
            ) : Object.keys(stats.nivel_distribucion).length === 0 ? (
              <span className="text-sm text-[var(--gp-muted)]">Sin socios aún</span>
            ) : (
              Object.entries(stats.nivel_distribucion).map(([nivel, count]) => (
                <div
                  key={nivel}
                  className="flex items-center gap-1.5"
                  data-testid={`nivel-count-${nivel}`}
                >
                  <NivelBadge nivel={nivel} />
                  <span className="text-xs text-[var(--gp-muted)]">×{count}</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-3 text-xs text-[var(--gp-muted)] inline-flex items-center gap-1">
            <TrendingUp size={12} /> auto-calculado por trigger
          </div>
        </div>
      </div>

      {/* Tables row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-6">
        <div className="gp-card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg gp-display">Socios recientes</h3>
            <Link
              to="/socios"
              className="text-xs text-[var(--gp-primary)] inline-flex items-center gap-1 hover:underline"
              data-testid="view-all-socios"
            >
              Ver todos <ArrowRight size={12} />
            </Link>
          </div>
          {loading ? (
            <div className="text-sm text-[var(--gp-muted)] py-6">Cargando…</div>
          ) : recentSocios.length === 0 ? (
            <div className="text-sm text-[var(--gp-muted)] py-10 text-center">
              Aún no tienes socios registrados.
              <br /> Comparte tu QR para empezar.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="gp-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Puntos</th>
                    <th>Nivel</th>
                    <th>Alta</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recentSocios.map((s) => (
                    <tr key={s.id} data-testid={`recent-socio-${s.id}`}>
                      <td className="font-medium">{s.nombre}</td>
                      <td className="text-[var(--gp-muted)]">{s.email}</td>
                      <td>{s.puntos}</td>
                      <td><NivelBadge nivel={s.nivel} /></td>
                      <td className="text-xs text-[var(--gp-muted)]">
                        {new Date(s.created_at).toLocaleDateString("es-ES")}
                      </td>
                      <td>
                        <Link
                          to={`/socios/${s.id}`}
                          className="text-xs text-[var(--gp-primary)] hover:underline"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="gp-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg gp-display">Últimas notificaciones</h3>
            <Link
              to="/notificaciones"
              className="text-xs text-[var(--gp-primary)] inline-flex items-center gap-1 hover:underline"
            >
              Ver todas <ArrowRight size={12} />
            </Link>
          </div>
          {loading ? (
            <div className="text-sm text-[var(--gp-muted)]">Cargando…</div>
          ) : recentNotifs.length === 0 ? (
            <div className="text-sm text-[var(--gp-muted)] py-10 text-center">
              Aún no has enviado notificaciones.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentNotifs.map((n) => (
                <li
                  key={n.id}
                  className="border border-[var(--gp-border)] rounded-xl p-3"
                  data-testid={`recent-notif-${n.id}`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-medium text-sm truncate">{n.titulo}</div>
                    <span className="text-[0.65rem] uppercase tracking-wider text-[var(--gp-primary)]">
                      {n.canal}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--gp-muted)] mt-1 line-clamp-2">
                    {n.mensaje}
                  </div>
                  <div className="flex justify-between items-center mt-2 text-[0.7rem] text-[var(--gp-muted)]">
                    <span>{new Date(n.created_at).toLocaleDateString("es-ES")}</span>
                    <span>{n.total_enviadas} enviadas</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AddSocioModal
        open={openSocio}
        onClose={() => setOpenSocio(false)}
        onCreated={load}
      />
      <SendNotificationModal
        open={openNotif}
        onClose={() => setOpenNotif(false)}
        onSent={load}
      />
    </Layout>
  );
}

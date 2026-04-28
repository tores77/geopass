import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import NivelBadge from "../components/NivelBadge";
import AddPointsModal from "../components/AddPointsModal";
import SendNotificationModal from "../components/SendNotificationModal";
import { ArrowLeft, Coins, Send, Wallet, Mail, Phone, Calendar } from "lucide-react";

export default function SocioDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/socios/${id}`);
      setData(d);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [id]);

  if (loading) {
    return (
      <Layout title="Socio">
        <div className="text-sm text-[var(--gp-muted)]">Cargando…</div>
      </Layout>
    );
  }
  if (!data) {
    return (
      <Layout title="Socio">
        <div className="text-sm text-[var(--gp-muted)]">No se encontró el socio.</div>
      </Layout>
    );
  }

  const { socio, transacciones, pass } = data;

  return (
    <Layout
      title="Detalle del socio"
      action={
        <Link
          to="/socios"
          className="text-sm text-[var(--gp-muted)] hover:text-[var(--gp-text)] inline-flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Volver
        </Link>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Profile */}
        <div className="gp-card p-6 lg:col-span-1" data-testid="socio-profile-card">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-[var(--gp-bg)] text-xl gp-display">
              {(socio.nombre || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xl gp-display truncate">{socio.nombre}</div>
              <NivelBadge nivel={socio.nivel} />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-2 text-[var(--gp-muted)]">
              <Mail size={14} />{" "}
              <span className="text-[var(--gp-text)] truncate">{socio.email}</span>
            </div>
            <div className="flex items-center gap-2 text-[var(--gp-muted)]">
              <Phone size={14} />{" "}
              <span className="text-[var(--gp-text)]">{socio.telefono || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-[var(--gp-muted)]">
              <Calendar size={14} />{" "}
              <span className="text-[var(--gp-text)]">
                Alta · {new Date(socio.created_at).toLocaleDateString("es-ES")}
              </span>
            </div>
          </div>

          <div className="mt-6 gp-card-elevated p-4 rounded-xl">
            <div className="text-[0.7rem] uppercase tracking-wider text-[var(--gp-muted)]">
              Puntos acumulados
            </div>
            <div className="text-4xl gp-display mt-1" data-testid="socio-puntos">
              {socio.puntos}
            </div>
          </div>

          <div className="mt-4 gp-card-elevated p-4 rounded-xl">
            <div className="flex items-center gap-2 text-[var(--gp-muted)] text-xs">
              <Wallet size={13} /> Wallet pass
            </div>
            <div className="mt-2 text-xs">
              {pass || socio.wallet_pass_serial ? (
                <span className="text-[var(--gp-primary)] break-all" data-testid="socio-pass-serial">
                  {socio.wallet_pass_serial}
                </span>
              ) : (
                <span className="text-[var(--gp-muted)]">Pass no generado</span>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={() => setPointsOpen(true)}
              className="gp-btn-primary w-full inline-flex items-center justify-center gap-1.5"
              data-testid="socio-add-points-btn"
            >
              <Coins size={15} /> Sumar puntos
            </button>
            <button
              onClick={() => setNotifOpen(true)}
              className="gp-btn-secondary w-full inline-flex items-center justify-center gap-1.5"
              data-testid="socio-send-notif-btn"
            >
              <Send size={15} /> Enviar notificación
            </button>
          </div>
        </div>

        {/* History */}
        <div className="gp-card p-6 lg:col-span-2">
          <h3 className="text-lg gp-display mb-4">Historial de puntos</h3>
          {transacciones.length === 0 ? (
            <div className="text-sm text-[var(--gp-muted)] py-10 text-center">
              Sin movimientos todavía.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <table className="gp-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Descripción</th>
                    <th>Puntos</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {transacciones.map((t) => (
                    <tr key={t.id} data-testid={`tx-${t.id}`}>
                      <td className="capitalize">{t.tipo}</td>
                      <td className="text-[var(--gp-muted)]">{t.descripcion || "—"}</td>
                      <td
                        className={
                          (t.puntos || 0) >= 0
                            ? "text-[var(--gp-success)]"
                            : "text-[var(--gp-error)]"
                        }
                      >
                        {(t.puntos || 0) > 0 ? `+${t.puntos}` : t.puntos}
                      </td>
                      <td className="text-xs text-[var(--gp-muted)]">
                        {new Date(t.created_at).toLocaleString("es-ES")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <AddPointsModal
        open={pointsOpen}
        socio={socio}
        onClose={() => setPointsOpen(false)}
        onUpdated={load}
      />
      <SendNotificationModal
        open={notifOpen}
        socio={socio}
        onClose={() => setNotifOpen(false)}
      />
    </Layout>
  );
}

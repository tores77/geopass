import React, { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import SendNotificationModal from "../components/SendNotificationModal";
import { Send } from "lucide-react";

export default function Notificaciones() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/notificaciones");
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Layout
      title="Notificaciones"
      action={
        <button
          onClick={() => setOpen(true)}
          className="gp-btn-primary inline-flex items-center gap-1.5"
          data-testid="notif-new-btn"
        >
          <Send size={15} /> Enviar nueva
        </button>
      }
    >
      <div className="gp-card p-5">
        {loading ? (
          <div className="text-sm text-[var(--gp-muted)] py-10 text-center">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-[var(--gp-muted)] py-14 text-center">
            Aún no has enviado notificaciones.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="gp-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Mensaje</th>
                  <th>Tipo</th>
                  <th>Canal</th>
                  <th>Enviadas</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {items.map((n) => (
                  <tr key={n.id} data-testid={`notif-row-${n.id}`}>
                    <td className="font-medium">{n.titulo}</td>
                    <td className="text-[var(--gp-muted)] max-w-md truncate">{n.mensaje}</td>
                    <td className="capitalize">{n.tipo}</td>
                    <td className="text-[var(--gp-secondary)] capitalize">{n.canal}</td>
                    <td>{n.total_enviadas}</td>
                    <td className="text-xs text-[var(--gp-muted)]">
                      {new Date(n.created_at).toLocaleString("es-ES")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SendNotificationModal open={open} onClose={() => setOpen(false)} onSent={load} />
    </Layout>
  );
}

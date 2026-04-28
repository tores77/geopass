import React, { useState } from "react";
import Modal from "./Modal";
import { api } from "../lib/api";
import { toast } from "sonner";

const CANALES = [
  { value: "ambos", label: "Wallet + FCM" },
  { value: "wallet", label: "Solo Wallet" },
  { value: "fcm", label: "Solo FCM" },
];

export default function SendNotificationModal({ open, onClose, socio = null, onSent }) {
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [canal, setCanal] = useState("ambos");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { titulo, mensaje, canal };
      if (socio) payload.socio_id = socio.id;
      const { data } = await api.post("/notificaciones/send", payload);
      toast.success(`Notificación enviada a ${data.total_enviadas} ${data.total_enviadas === 1 ? "socio" : "socios"}`);
      setTitulo(""); setMensaje("");
      onSent && onSent(data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al enviar la notificación");
    } finally {
      setBusy(false);
    }
  };

  const audience = socio ? `Solo a ${socio.nombre}` : "A todos los socios activos";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enviar notificación"
      testid="send-notification-modal"
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="text-xs text-[var(--gp-muted)] -mt-2">
          Destinatarios: <span className="text-[var(--gp-primary)] font-medium">{audience}</span>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">Título <span className="opacity-60">(máx 50)</span></label>
          <input
            maxLength={50}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
            className="gp-input mt-1"
            data-testid="notif-titulo"
            placeholder="Ej. Oferta exclusiva"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">Mensaje <span className="opacity-60">(máx 150)</span></label>
          <textarea
            maxLength={150}
            rows={3}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            required
            className="gp-input mt-1"
            data-testid="notif-mensaje"
            placeholder="Escribe el mensaje que verán tus socios..."
          />
          <div className="text-right text-[0.7rem] text-[var(--gp-muted)] mt-1">
            {mensaje.length}/150
          </div>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">Canal</label>
          <div className="flex gap-2 mt-2">
            {CANALES.map((c) => (
              <button
                type="button"
                key={c.value}
                onClick={() => setCanal(c.value)}
                data-testid={`canal-${c.value}`}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  canal === c.value
                    ? "border-[var(--gp-primary)] text-[var(--gp-primary)] bg-[rgba(0,229,160,0.08)]"
                    : "border-[var(--gp-border)] text-[var(--gp-muted)] hover:text-[var(--gp-text)]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Phone preview */}
        <div className="mt-2 gp-card-elevated p-4 rounded-xl">
          <div className="text-[0.65rem] text-[var(--gp-muted)] uppercase tracking-wider mb-2">Vista previa</div>
          <div className="bg-black/40 rounded-xl p-3 border border-[var(--gp-border)]">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <div className="text-xs font-semibold">{titulo || "Título"}</div>
                  <div className="text-[0.65rem] text-[var(--gp-muted)]">ahora</div>
                </div>
                <div className="text-xs text-[var(--gp-muted)] mt-0.5 break-words">
                  {mensaje || "Tu mensaje aparecerá aquí"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="gp-btn-secondary">Cancelar</button>
          <button type="submit" disabled={busy} className="gp-btn-primary" data-testid="notif-send-submit">
            {busy ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

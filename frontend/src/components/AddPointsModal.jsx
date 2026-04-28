import React, { useState } from "react";
import Modal from "./Modal";
import { api } from "../lib/api";
import { toast } from "sonner";

export default function AddPointsModal({ open, onClose, socio, onUpdated }) {
  const [puntos, setPuntos] = useState(50);
  const [descripcion, setDescripcion] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!socio) return;
    setBusy(true);
    try {
      await api.post(`/socios/${socio.id}/puntos`, {
        puntos: Number(puntos),
        descripcion,
      });
      toast.success(`+${puntos} puntos añadidos`);
      setDescripcion("");
      onUpdated && onUpdated();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al sumar puntos");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Sumar puntos · ${socio?.nombre || ""}`} testid="add-points-modal">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">Puntos</label>
          <input
            type="number"
            min="1"
            value={puntos}
            onChange={(e) => setPuntos(e.target.value)}
            className="gp-input mt-1"
            required
            data-testid="add-points-amount"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">Descripción</label>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej. Compra en tienda física"
            className="gp-input mt-1"
            required
            data-testid="add-points-description"
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="gp-btn-secondary">Cancelar</button>
          <button type="submit" disabled={busy} className="gp-btn-primary" data-testid="add-points-submit">
            {busy ? "Sumando..." : "Confirmar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

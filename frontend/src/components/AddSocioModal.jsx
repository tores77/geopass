import React, { useState } from "react";
import Modal from "./Modal";
import { api } from "../lib/api";
import { toast } from "sonner";

export default function AddSocioModal({ open, onClose, onCreated }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/socios", { nombre, email, telefono: telefono || null });
      toast.success("Socio creado correctamente");
      setNombre(""); setEmail(""); setTelefono("");
      onCreated && onCreated(data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al crear el socio");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuevo socio" testid="add-socio-modal">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">Nombre</label>
          <input className="gp-input mt-1" value={nombre} required onChange={(e) => setNombre(e.target.value)} data-testid="add-socio-nombre" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">Email</label>
          <input className="gp-input mt-1" type="email" value={email} required onChange={(e) => setEmail(e.target.value)} data-testid="add-socio-email" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--gp-muted)]">Teléfono <span className="opacity-60">(opcional)</span></label>
          <input className="gp-input mt-1" value={telefono} onChange={(e) => setTelefono(e.target.value)} data-testid="add-socio-telefono" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="gp-btn-secondary" data-testid="add-socio-cancel">
            Cancelar
          </button>
          <button type="submit" disabled={busy} className="gp-btn-primary" data-testid="add-socio-submit">
            {busy ? "Creando..." : "Crear socio"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

import React, { useState } from "react";
import { X } from "lucide-react";

export default function Modal({ open, onClose, title, children, testid }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      data-testid={testid}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="gp-card w-full max-w-lg p-6 relative gp-fade-up"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl gp-display">{title}</h2>
          <button
            onClick={onClose}
            className="text-[var(--gp-muted)] hover:text-[var(--gp-text)]"
            data-testid="modal-close"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useModal(initial = false) {
  const [open, setOpen] = useState(initial);
  return { open, openModal: () => setOpen(true), closeModal: () => setOpen(false), setOpen };
}

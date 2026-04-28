import React, { useState } from "react";
import Sidebar from "./Sidebar";
import { Menu } from "lucide-react";

export default function Layout({ children, title, action }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <main className="flex-1 min-w-0">
        <header className="flex items-center justify-between px-5 lg:px-10 py-5 border-b border-[var(--gp-border)] bg-[var(--gp-bg)]/80 backdrop-blur sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 -ml-2 text-[var(--gp-muted)] hover:text-[var(--gp-text)]"
              onClick={() => setOpen(true)}
              data-testid="open-sidebar-btn"
            >
              <Menu size={22} />
            </button>
            <h1 className="text-xl lg:text-2xl gp-display" data-testid="page-title">
              {title}
            </h1>
          </div>
          <div>{action}</div>
        </header>
        <div className="px-5 lg:px-10 py-7 gp-fade-up">{children}</div>
      </main>
    </div>
  );
}

import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Shield, LayoutDashboard, Building, ArrowLeft, LogOut, Menu } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function SuperadminLayout({ children, title, action }) {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex">
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-72 px-5 py-7 flex flex-col gap-6
          bg-[var(--gp-card)] border-r border-[var(--gp-border)]
          transform ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
          transition-transform duration-300`}
      >
        <div>
          <div className="text-2xl gp-display gp-gradient-text">GeoPass™</div>
          <div className="text-xs text-[var(--gp-muted)] tracking-wide mt-0.5 mb-3">
            by Umania Labs
          </div>
          <span
            className="inline-flex items-center gap-1 text-[0.6rem] font-bold uppercase tracking-widest px-2 py-1 rounded-full"
            style={{
              background: "rgba(255,80,80,0.12)",
              color: "#FF5050",
              border: "1px solid rgba(255,80,80,0.4)",
            }}
            data-testid="superadmin-badge"
          >
            <Shield size={10} /> SUPERADMIN
          </span>
        </div>

        <nav className="flex flex-col gap-1 mt-1 flex-1">
          <NavLink
            to="/superadmin"
            end
            onClick={() => setOpen(false)}
            data-testid="nav-sa-dashboard"
            className={({ isActive }) => `gp-nav-link ${isActive ? "active" : ""}`}
          >
            <LayoutDashboard size={18} strokeWidth={1.8} />
            <span className="text-sm">Dashboard</span>
          </NavLink>
          <NavLink
            to="/superadmin"
            onClick={() => setOpen(false)}
            data-testid="nav-sa-tenants"
            className={({ isActive }) => `gp-nav-link ${isActive ? "active" : ""}`}
            end
          >
            <Building size={18} strokeWidth={1.8} />
            <span className="text-sm">Tenants</span>
          </NavLink>
          <Link
            to="/dashboard"
            onClick={() => setOpen(false)}
            data-testid="nav-back-panel"
            className="gp-nav-link"
          >
            <ArrowLeft size={18} strokeWidth={1.8} />
            <span className="text-sm">Volver al panel</span>
          </Link>
        </nav>

        <div className="border-t border-[var(--gp-border)] pt-4">
          {profile && (
            <div className="px-2 mb-3">
              <div className="text-sm font-medium truncate">{profile.nombre}</div>
              <div className="text-xs text-[var(--gp-muted)] truncate">{profile.email}</div>
            </div>
          )}
          <button
            onClick={onLogout}
            data-testid="logout-btn"
            className="gp-nav-link w-full text-left"
          >
            <LogOut size={18} strokeWidth={1.8} />
            <span className="text-sm">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="flex items-center justify-between px-5 lg:px-10 py-5 border-b border-[var(--gp-border)] bg-[var(--gp-bg)]/80 backdrop-blur sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 -ml-2 text-[var(--gp-muted)] hover:text-[var(--gp-text)]"
              onClick={() => setOpen(true)}
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

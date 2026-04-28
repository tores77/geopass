import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Bell,
  Building2,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/socios", label: "Socios", icon: Users, testid: "nav-socios" },
  { to: "/notificaciones", label: "Notificaciones", icon: Bell, testid: "nav-notificaciones" },
  { to: "/aliados", label: "Comercios aliados", icon: Building2, testid: "nav-aliados" },
  { to: "/configuracion", label: "Configuración", icon: Settings, testid: "nav-configuracion" },
];

export default function Sidebar({ open, onClose }) {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={onClose}
          data-testid="sidebar-backdrop"
        />
      )}
      <aside
        data-testid="sidebar"
        className={`fixed lg:static inset-y-0 left-0 z-40 w-72 px-5 py-7 flex flex-col gap-6
          bg-[var(--gp-card)] border-r border-[var(--gp-border)]
          transform ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
          transition-transform duration-300`}
      >
        <div>
          <div className="text-2xl gp-display gp-gradient-text">GeoPass™</div>
          <div className="text-xs text-[var(--gp-muted)] tracking-wide mt-0.5">
            by Umania Labs
          </div>
        </div>

        {profile && (
          <div className="gp-card-elevated p-3 rounded-xl">
            <div className="text-[0.7rem] uppercase tracking-wider text-[var(--gp-muted)]">
              Tenant
            </div>
            <div className="text-sm font-semibold mt-0.5" data-testid="sidebar-tenant">
              {profile.tenant?.nombre_marca}
            </div>
          </div>
        )}

        <nav className="flex flex-col gap-1 mt-1 flex-1">
          {links.map(({ to, label, icon: Icon, testid }) => (
            <NavLink
              key={to}
              to={to}
              data-testid={testid}
              onClick={onClose}
              className={({ isActive }) => `gp-nav-link ${isActive ? "active" : ""}`}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span className="text-sm">{label}</span>
            </NavLink>
          ))}
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
    </>
  );
}

import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function SuperadminRoute({ children }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--gp-muted)]">
        Cargando...
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.rol !== "superadmin") return <Navigate to="/dashboard" replace />;
  return children;
}

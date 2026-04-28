import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        data-testid="auth-loading"
        className="min-h-screen flex items-center justify-center text-[var(--gp-muted)]"
      >
        Cargando...
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

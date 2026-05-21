import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Socios from "./pages/Socios";
import SocioDetail from "./pages/SocioDetail";
import Notificaciones from "./pages/Notificaciones";
import Aliados from "./pages/Aliados";
import Configuracion from "./pages/Configuracion";
import ConfiguracionTarjeta from "./pages/ConfiguracionTarjeta";
import Registro from "./pages/Registro";
import PreviewPass from "./pages/PreviewPass";
import Onboarding from "./pages/Onboarding";
import SuperadminDashboard from "./pages/SuperadminDashboard";
import SuperadminTenantNew from "./pages/SuperadminTenantNew";
import SuperadminTenantDetail from "./pages/SuperadminTenantDetail";
import SuperadminRoute from "./components/SuperadminRoute";
import { listenForegroundMessages } from "./lib/firebase";

function App() {
  // Attach the FCM foreground listener once at app startup for ANY tab that
  // already has notification permission. Without this, pushes only render
  // when the tab is in the background (SW path) — and any subsequent reload
  // or navigation would silently drop foreground pushes.
  useEffect(() => {
    listenForegroundMessages();
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: "#13131f",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#f0f0f0",
            },
          }}
        />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/registro/:tenant_slug" element={<Registro />} />
          <Route path="/preview-pass/:tenant_slug" element={<PreviewPass />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/socios"
            element={
              <ProtectedRoute>
                <Socios />
              </ProtectedRoute>
            }
          />
          <Route
            path="/socios/:id"
            element={
              <ProtectedRoute>
                <SocioDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notificaciones"
            element={
              <ProtectedRoute>
                <Notificaciones />
              </ProtectedRoute>
            }
          />
          <Route
            path="/aliados"
            element={
              <ProtectedRoute>
                <Aliados />
              </ProtectedRoute>
            }
          />
          <Route
            path="/configuracion"
            element={
              <ProtectedRoute>
                <Configuracion />
              </ProtectedRoute>
            }
          />
          <Route
            path="/configuracion-tarjeta"
            element={
              <ProtectedRoute>
                <ConfiguracionTarjeta />
              </ProtectedRoute>
            }
          />
          <Route
            path="/superadmin"
            element={
              <SuperadminRoute>
                <SuperadminDashboard />
              </SuperadminRoute>
            }
          />
          <Route
            path="/superadmin/tenants/new"
            element={
              <SuperadminRoute>
                <SuperadminTenantNew />
              </SuperadminRoute>
            }
          />
          <Route
            path="/superadmin/tenants/:id"
            element={
              <SuperadminRoute>
                <SuperadminTenantDetail />
              </SuperadminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

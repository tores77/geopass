import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  api,
  getImpersonatedTenantId,
  setImpersonatedTenantId,
} from "../lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(getImpersonatedTenantId());

  const fetchProfile = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setProfile(data);
    } catch (e) {
      setProfile(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
      if (data.session) fetchProfile().finally(() => setLoading(false));
      else setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) fetchProfile();
      else {
        setProfile(null);
        // Clear any impersonation when the user logs out.
        setImpersonatedTenantId(null);
        setImpersonating(null);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line
  }, []);

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setSession(data.session);
    await fetchProfile();
    return data;
  };

  const logout = async () => {
    setImpersonatedTenantId(null);
    setImpersonating(null);
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  const impersonate = async (tenantId) => {
    setImpersonatedTenantId(tenantId);
    setImpersonating(tenantId);
    await fetchProfile();
  };

  const stopImpersonating = async () => {
    setImpersonatedTenantId(null);
    setImpersonating(null);
    await fetchProfile();
  };

  const isSuperadmin = profile?.rol === "superadmin";

  return (
    <AuthCtx.Provider
      value={{
        session,
        profile,
        loading,
        login,
        logout,
        refresh: fetchProfile,
        impersonating,
        impersonate,
        stopImpersonating,
        isSuperadmin,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

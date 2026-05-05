import axios from "axios";
import { supabase } from "./supabaseClient";

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

const IMPERSONATE_KEY = "geopass.impersonateTenantId";

export const getImpersonatedTenantId = () => {
  try {
    return localStorage.getItem(IMPERSONATE_KEY) || null;
  } catch {
    return null;
  }
};

export const setImpersonatedTenantId = (id) => {
  try {
    if (id) localStorage.setItem(IMPERSONATE_KEY, id);
    else localStorage.removeItem(IMPERSONATE_KEY);
  } catch {
    /* no-op */
  }
};

export const api = axios.create({ baseURL: BASE });

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const impTenant = getImpersonatedTenantId();
  if (impTenant) {
    config.headers["X-Impersonate-Tenant-Id"] = impTenant;
  }
  return config;
});

export const publicApi = axios.create({ baseURL: BASE });

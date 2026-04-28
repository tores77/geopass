import axios from "axios";
import { supabase } from "./supabaseClient";

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: BASE });

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const publicApi = axios.create({ baseURL: BASE });

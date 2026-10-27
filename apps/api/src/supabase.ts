import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const url = config.supabaseUrl || "http://127.0.0.1:54321";
const anonKey = config.supabaseAnonKey || "not-configured";
const serviceKey = config.supabaseServiceRoleKey || "not-configured";

export const authClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const databaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

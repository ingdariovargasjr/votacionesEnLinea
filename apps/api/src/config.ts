import "dotenv/config";

const csv = (value: string | undefined) =>
  (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
const publicWebUrl = (process.env.PUBLIC_WEB_URL ?? csv(process.env.CORS_ORIGINS)[0] ?? "http://localhost:5173").replace(/\/$/, "");

export const config = {
  port: Number(process.env.PORT) || 3001,
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  adminUserIds: new Set(csv(process.env.ADMIN_USER_IDS)),
  superuserEmail: (process.env.SUPERUSER_EMAIL ?? "").trim().toLowerCase(),
  corsOrigins: new Set(csv(process.env.CORS_ORIGINS).concat(publicWebUrl, "http://localhost:5173")),
  publicWebUrl,
};

export const hasSupabaseConfig = Boolean(
  config.supabaseUrl && config.supabaseAnonKey && config.supabaseServiceRoleKey,
);

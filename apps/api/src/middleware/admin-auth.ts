import type { NextFunction, Request, Response } from "express";
import { config, hasSupabaseConfig } from "../config.js";
import { authClient } from "../supabase.js";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!hasSupabaseConfig || config.adminUserIds.size === 0) {
    res.status(503).json({ error: { code: "admin_auth_not_configured", message: "Falta configurar Supabase y ADMIN_USER_IDS en el API." } });
    return;
  }

  const match = req.header("authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: { code: "unauthorized", message: "Inicia sesión para continuar." } });
    return;
  }

  const { data, error } = await authClient.auth.getUser(match[1]);
  if (error || !data.user) {
    res.status(401).json({ error: { code: "invalid_session", message: "La sesión no es válida o expiró." } });
    return;
  }
  if (!config.adminUserIds.has(data.user.id)) {
    res.status(403).json({ error: { code: "admin_required", message: "Esta cuenta no está autorizada para administrar galas." } });
    return;
  }

  req.adminUser = { id: data.user.id, email: data.user.email };
  next();
}

import type { NextFunction, Request, Response } from "express";
import { config, hasSupabaseConfig } from "../config.js";
import { authClient, databaseClient } from "../supabase.js";

type Profile = NonNullable<Request["account"]>;

export function canManageGalas(account: Profile) {
  return account.role === "superuser" || account.subscription_status === "active";
}

export async function requireAccount(req: Request, res: Response, next: NextFunction) {
  if (!hasSupabaseConfig) {
    res.status(503).json({ error: { code: "account_service_not_configured", message: "El servicio de cuentas todavía no está configurado." } });
    return;
  }

  const token = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: { code: "unauthorized", message: "Inicia sesión para continuar." } });
    return;
  }

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const user = authData.user;
  if (authError || !user || !user.email) {
    res.status(401).json({ error: { code: "invalid_session", message: "La sesión no es válida o expiró." } });
    return;
  }
  if (!user.email_confirmed_at && !user.confirmed_at) {
    res.status(403).json({ error: { code: "email_not_confirmed", message: "Confirma tu correo antes de usar la plataforma." } });
    return;
  }

  const normalizedEmail = user.email.trim().toLowerCase();
  const bootstrapSuperuser = Boolean(config.superuserEmail && normalizedEmail === config.superuserEmail);
  // Compatibilidad temporal con el allowlist de la primera versión.
  const legacySuperuser = config.adminUserIds.has(user.id);
  const promoteToSuperuser = bootstrapSuperuser || legacySuperuser;

  if (promoteToSuperuser) {
    const { data: profile, error } = await databaseClient.from("profiles").upsert({
      id: user.id,
      email: normalizedEmail,
      role: "superuser",
      plan_code: "free",
      subscription_status: "free",
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" }).select("id,email,role,plan_code,subscription_status").single();
    if (error || !profile) {
      res.status(503).json({ error: { code: "profile_schema_unavailable", message: "No se pudo preparar la cuenta. Aplica la migración de perfiles de Supabase." } });
      return;
    }
    req.account = profile as Profile;
    next();
    return;
  }

  let { data: profile, error: profileError } = await databaseClient.from("profiles")
    .select("id,email,role,plan_code,subscription_status").eq("id", user.id).maybeSingle();
  if (profileError) {
    res.status(503).json({ error: { code: "profile_schema_unavailable", message: "No se pudo cargar tu perfil. Aplica la migración de perfiles de Supabase." } });
    return;
  }
  if (!profile) {
    const { data, error } = await databaseClient.from("profiles").insert({
      id: user.id,
      email: normalizedEmail,
      role: "member",
      plan_code: null,
      subscription_status: "payment_required",
    }).select("id,email,role,plan_code,subscription_status").single();
    if (error || !data) {
      res.status(503).json({ error: { code: "profile_setup_failed", message: "No se pudo preparar tu perfil. Intenta nuevamente." } });
      return;
    }
    profile = data;
  } else if (profile.email !== normalizedEmail) {
    const { data, error } = await databaseClient.from("profiles").update({ email: normalizedEmail, updated_at: new Date().toISOString() })
      .eq("id", user.id).select("id,email,role,plan_code,subscription_status").single();
    if (error || !data) {
      res.status(503).json({ error: { code: "profile_update_failed", message: "No se pudo actualizar tu perfil." } });
      return;
    }
    profile = data;
  }

  req.account = profile as Profile;
  next();
}

export function requirePaidPlan(req: Request, res: Response, next: NextFunction) {
  const account = req.account;
  if (!account) {
    res.status(401).json({ error: { code: "unauthorized", message: "Inicia sesión para continuar." } });
    return;
  }
  if (!canManageGalas(account)) {
    res.status(402).json({ error: { code: "subscription_required", message: "Necesitas una suscripción activa para crear o editar galas." } });
    return;
  }
  next();
}

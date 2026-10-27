import { Router } from "express";
import { z } from "zod";
import { hasSupabaseConfig } from "../config.js";
import { requireAccount, requirePaidPlan } from "../middleware/account-auth.js";
import { createEventSchema, eventIdSchema, updateEventSchema } from "../schemas/events.js";
import { eventThemeSchema } from "../schemas/themes.js";
import { embedOriginsSchema } from "../schemas/embed-origins.js";
import { databaseClient } from "../supabase.js";

export const eventsRouter = Router();

const eventFighterSchema = z.object({
  name: z.string().trim().min(2).max(100),
  identityNote: z.string().trim().max(100).default(""),
}).strict();

function normalizedFighterName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function unavailable(res: import("express").Response) {
  return res.status(503).json({ error: { code: "database_not_configured", message: "Configura las variables de Supabase en el API." } });
}

eventsRouter.use(requireAccount);

eventsRouter.get("/", async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  let query = databaseClient.from("events").select("id,name,slug,description,timezone,status,created_at,updated_at").order("created_at", { ascending: false });
  if (req.account!.role !== "superuser") query = query.eq("owner_id", req.account!.id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: { code: "events_load_failed", message: "No se pudieron cargar las galas." } });
  return res.json({ data });
});

eventsRouter.post("/", requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "validation_failed", message: "Revisa los datos de la gala.", details: parsed.error.flatten() } });

  const { data, error } = await databaseClient.from("events").insert({
    ...parsed.data,
    owner_id: req.account!.id,
    status: "draft",
  }).select("id,name,slug,description,timezone,status,created_at,updated_at").single();

  if (error?.code === "23505") return res.status(409).json({ error: { code: "slug_taken", message: "Ese identificador ya está en uso. Prueba con otro." } });
  if (error) return res.status(500).json({ error: { code: "event_create_failed", message: "No se pudo guardar la gala." } });
  return res.status(201).json({ data });
});

eventsRouter.get("/:id/fighters", async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const id = eventIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: { code: "invalid_event_id", message: "El identificador de la gala no es válido." } });
  let eventQuery = databaseClient.from("events").select("id").eq("id", id.data);
  if (req.account!.role !== "superuser") eventQuery = eventQuery.eq("owner_id", req.account!.id);
  const { data: event, error: eventError } = await eventQuery.maybeSingle();
  if (eventError) return res.status(500).json({ error: { code: "event_check_failed", message: "No se pudo validar el acceso a la gala." } });
  if (!event) return res.status(404).json({ error: { code: "event_not_found", message: "No encontramos esa gala." } });
  const { data, error } = await databaseClient.from("event_fighters")
    .select("id,name,identity_note,created_at").eq("event_id", id.data).order("name").order("created_at");
  if (error?.code === "PGRST205") return res.status(503).json({ error: { code: "fighter_identity_migration_required", message: "Falta aplicar la migración 202610210011_gala_fighter_identities.sql." } });
  if (error) return res.status(500).json({ error: { code: "event_fighters_load_failed", message: "No se pudieron cargar los luchadores maestros." } });
  return res.json({ data: (data ?? []).map((fighter) => ({ id: fighter.id, name: fighter.name, identityNote: fighter.identity_note })) });
});

eventsRouter.post("/:id/fighters", requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const id = eventIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: { code: "invalid_event_id", message: "El identificador de la gala no es válido." } });
  const parsed = eventFighterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "validation_failed", message: "Revisa el nombre del luchador maestro.", details: parsed.error.flatten() } });
  let eventQuery = databaseClient.from("events").select("id,status").eq("id", id.data);
  if (req.account!.role !== "superuser") eventQuery = eventQuery.eq("owner_id", req.account!.id);
  const { data: event, error: eventError } = await eventQuery.maybeSingle();
  if (eventError) return res.status(500).json({ error: { code: "event_check_failed", message: "No se pudo validar el acceso a la gala." } });
  if (!event) return res.status(404).json({ error: { code: "event_not_found", message: "No encontramos esa gala." } });
  if (event.status === "closed") return res.status(409).json({ error: { code: "event_closed", message: "No se pueden agregar luchadores a una gala cerrada." } });

  const { data, error } = await databaseClient.from("event_fighters").insert({
    event_id: id.data,
    name: parsed.data.name,
    identity_note: parsed.data.identityNote,
    normalized_name: normalizedFighterName(parsed.data.name),
  }).select("id,name,identity_note").single();
  if (error) return res.status(500).json({ error: { code: "event_fighter_create_failed", message: "No se pudo crear la identidad del luchador." } });
  return res.status(201).json({ data: { id: data.id, name: data.name, identityNote: data.identity_note } });
});

eventsRouter.put("/:id/fighters/:fighterId", requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const id = eventIdSchema.safeParse(req.params.id);
  const fighterId = z.uuid().safeParse(req.params.fighterId);
  if (!id.success || !fighterId.success) return res.status(400).json({ error: { code: "invalid_event_fighter_id", message: "El identificador del luchador no es válido." } });
  const parsed = eventFighterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "validation_failed", message: "Revisa el nombre del luchador maestro.", details: parsed.error.flatten() } });
  let eventQuery = databaseClient.from("events").select("id,status").eq("id", id.data);
  if (req.account!.role !== "superuser") eventQuery = eventQuery.eq("owner_id", req.account!.id);
  const { data: event, error: eventError } = await eventQuery.maybeSingle();
  if (eventError) return res.status(500).json({ error: { code: "event_check_failed", message: "No se pudo validar el acceso a la gala." } });
  if (!event) return res.status(404).json({ error: { code: "event_not_found", message: "No encontramos esa gala." } });
  if (event.status === "closed") return res.status(409).json({ error: { code: "event_closed", message: "No se pueden editar identidades de una gala cerrada." } });
  const { data, error } = await databaseClient.from("event_fighters").update({
    name: parsed.data.name,
    identity_note: parsed.data.identityNote,
    normalized_name: normalizedFighterName(parsed.data.name),
  }).eq("id", fighterId.data).eq("event_id", id.data).select("id,name,identity_note").maybeSingle();
  if (error) return res.status(500).json({ error: { code: "event_fighter_update_failed", message: "No se pudo editar la identidad del luchador." } });
  if (!data) return res.status(404).json({ error: { code: "event_fighter_not_found", message: "No encontramos ese luchador de esta gala." } });
  return res.json({ data: { id: data.id, name: data.name, identityNote: data.identity_note } });
});

eventsRouter.get("/:id", async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const id = eventIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: { code: "invalid_event_id", message: "El identificador de la gala no es válido." } });
  let query = databaseClient.from("events").select("id,name,slug,description,timezone,status,created_at,updated_at").eq("id", id.data);
  if (req.account!.role !== "superuser") query = query.eq("owner_id", req.account!.id);
  const { data, error } = await query.maybeSingle();
  if (error) return res.status(500).json({ error: { code: "event_load_failed", message: "No se pudo cargar la gala." } });
  if (!data) return res.status(404).json({ error: { code: "event_not_found", message: "No encontramos esa gala." } });
  return res.json({ data });
});

eventsRouter.get("/:id/theme", async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const id = eventIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: { code: "invalid_event_id", message: "El identificador de la gala no es válido." } });

  let query = databaseClient.from("events").select("id,theme_primary_color,theme_secondary_color,theme_font_family").eq("id", id.data);
  if (req.account!.role !== "superuser") query = query.eq("owner_id", req.account!.id);
  const { data, error } = await query.maybeSingle();
  if (error?.code === "PGRST204" || error?.code === "PGRST205") return res.status(503).json({ error: { code: "theme_migration_required", message: "Falta aplicar la migración 202610210004_add_event_theme.sql para guardar la apariencia." } });
  if (error) return res.status(500).json({ error: { code: "event_theme_load_failed", message: "No se pudo cargar la apariencia de la gala." } });
  if (!data) return res.status(404).json({ error: { code: "event_not_found", message: "No encontramos esa gala." } });
  return res.json({ data: { eventId: data.id, primaryColor: data.theme_primary_color, secondaryColor: data.theme_secondary_color, fontFamily: data.theme_font_family } });
});

eventsRouter.get("/:id/results", async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const id = eventIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: { code: "invalid_event_id", message: "El identificador de la gala no es válido." } });
  let eventQuery = databaseClient.from("events").select("id").eq("id", id.data);
  if (req.account!.role !== "superuser") eventQuery = eventQuery.eq("owner_id", req.account!.id);
  const { data: event, error: eventError } = await eventQuery.maybeSingle();
  if (eventError) return res.status(500).json({ error: { code: "event_check_failed", message: "No se pudo validar el acceso a la gala." } });
  if (!event) return res.status(404).json({ error: { code: "event_not_found", message: "No encontramos esa gala." } });

  const { data, error } = await databaseClient.rpc("get_event_vote_results", { p_event_id: id.data });
  if (error?.code === "PGRST202") return res.status(503).json({ error: { code: "results_migration_required", message: "Falta aplicar la migración 202610210010_event_vote_results.sql." } });
  if (error) return res.status(500).json({ error: { code: "event_results_load_failed", message: "No se pudieron cargar los resultados de la gala." } });
  res.set("Cache-Control", "no-store");
  return res.json({ data });
});

eventsRouter.put("/:id/theme", requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const id = eventIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: { code: "invalid_event_id", message: "El identificador de la gala no es válido." } });
  const parsed = eventThemeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "validation_failed", message: "Revisa los colores y la tipografía de la gala.", details: parsed.error.flatten() } });

  let query = databaseClient.from("events").update({
    theme_primary_color: parsed.data.primaryColor,
    theme_secondary_color: parsed.data.secondaryColor,
    theme_font_family: parsed.data.fontFamily,
    updated_at: new Date().toISOString(),
  }).eq("id", id.data);
  if (req.account!.role !== "superuser") query = query.eq("owner_id", req.account!.id);
  const { data, error } = await query.select("id,theme_primary_color,theme_secondary_color,theme_font_family").maybeSingle();
  if (error?.code === "PGRST204" || error?.code === "PGRST205") return res.status(503).json({ error: { code: "theme_migration_required", message: "Falta aplicar la migración 202610210004_add_event_theme.sql para guardar la apariencia." } });
  if (error) return res.status(500).json({ error: { code: "event_theme_save_failed", message: "No se pudo guardar la apariencia de la gala." } });
  if (!data) return res.status(404).json({ error: { code: "event_not_found", message: "No encontramos esa gala." } });
  return res.json({ data: { eventId: data.id, primaryColor: data.theme_primary_color, secondaryColor: data.theme_secondary_color, fontFamily: data.theme_font_family } });
});

eventsRouter.get("/:id/embed-origins", async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const id = eventIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: { code: "invalid_event_id", message: "El identificador de la gala no es válido." } });

  let query = databaseClient.from("events").select("id,allowed_embed_origins").eq("id", id.data);
  if (req.account!.role !== "superuser") query = query.eq("owner_id", req.account!.id);
  const { data, error } = await query.maybeSingle();
  if (error?.code === "PGRST204") return res.status(503).json({ error: { code: "publication_migration_required", message: "Falta aplicar la migración 202610210006_publish_ballot_versions.sql para configurar la publicación." } });
  if (error) return res.status(500).json({ error: { code: "embed_origins_load_failed", message: "No se pudieron cargar los dominios permitidos." } });
  if (!data) return res.status(404).json({ error: { code: "event_not_found", message: "No encontramos esa gala." } });
  return res.json({ data: { eventId: data.id, origins: data.allowed_embed_origins ?? [] } });
});

eventsRouter.put("/:id/embed-origins", requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const id = eventIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: { code: "invalid_event_id", message: "El identificador de la gala no es válido." } });
  const parsed = embedOriginsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "validation_failed", message: "Revisa los dominios autorizados.", details: parsed.error.flatten() } });

  let query = databaseClient.from("events").update({ allowed_embed_origins: parsed.data.origins, updated_at: new Date().toISOString() }).eq("id", id.data);
  if (req.account!.role !== "superuser") query = query.eq("owner_id", req.account!.id);
  const { data, error } = await query.select("id,allowed_embed_origins").maybeSingle();
  if (error?.code === "PGRST204") return res.status(503).json({ error: { code: "publication_migration_required", message: "Falta aplicar la migración 202610210006_publish_ballot_versions.sql para configurar la publicación." } });
  if (error) return res.status(500).json({ error: { code: "embed_origins_save_failed", message: "No se pudieron guardar los dominios permitidos." } });
  if (!data) return res.status(404).json({ error: { code: "event_not_found", message: "No encontramos esa gala." } });
  return res.json({ data: { eventId: data.id, origins: data.allowed_embed_origins ?? [] } });
});

eventsRouter.patch("/:id", requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const id = eventIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: { code: "invalid_event_id", message: "El identificador de la gala no es válido." } });
  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "validation_failed", message: "Revisa los datos de la gala.", details: parsed.error.flatten() } });

  let query = databaseClient.from("events").update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id.data).eq("status", "draft");
  if (req.account!.role !== "superuser") query = query.eq("owner_id", req.account!.id);
  const { data, error } = await query.select("id,name,slug,description,timezone,status,created_at,updated_at").maybeSingle();
  if (error?.code === "23505") return res.status(409).json({ error: { code: "slug_taken", message: "Ese identificador ya está en uso." } });
  if (error) return res.status(500).json({ error: { code: "event_update_failed", message: "No se pudo actualizar la gala." } });
  if (!data) return res.status(404).json({ error: { code: "draft_not_found", message: "No encontramos una gala en borrador para editar." } });
  return res.json({ data });
});

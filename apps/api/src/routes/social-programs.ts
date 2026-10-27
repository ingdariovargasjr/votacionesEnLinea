import { Router, type Response } from "express";
import { z } from "zod";
import { hasSupabaseConfig } from "../config.js";
import { requireAccount, requirePaidPlan } from "../middleware/account-auth.js";
import { databaseClient } from "../supabase.js";

export const socialProgramsRouter = Router();
socialProgramsRouter.use(requireAccount);

const requirementSchema = z.object({
  network: z.enum(["Facebook", "Instagram", "TikTok"]),
  actionType: z.enum(["follow", "like"]),
  pageName: z.string().trim().min(2).max(100),
  pageUrl: z.url().refine((value) => value.startsWith("https://"), "El enlace debe usar HTTPS."),
}).strict();

const programSchema = z.object({
  name: z.string().trim().min(2).max(100),
  requirements: z.array(requirementSchema).max(4).default([]),
}).strict();

function unavailable(res: Response) {
  return res.status(503).json({ error: { code: "database_not_configured", message: "Configura Supabase en el API." } });
}

function apiRequirement(row: { id: string; network: string; action_type: string; page_name: string; page_url: string; sort_order: number }) {
  return { id: row.id, network: row.network, actionType: row.action_type, pageName: row.page_name, pageUrl: row.page_url, sortOrder: row.sort_order };
}

async function loadPrograms(ownerId: string, isSuperuser: boolean) {
  let query = databaseClient.from("social_access_programs").select("id,owner_id,name,created_at,updated_at").order("created_at", { ascending: false });
  if (!isSuperuser) query = query.eq("owner_id", ownerId);
  const { data: programs, error } = await query;
  if (error || !programs) return { data: null, error };
  if (!programs.length) return { data: [], error: null };
  const { data: requirements, error: requirementError } = await databaseClient.from("social_requirements")
    .select("id,program_id,network,action_type,page_name,page_url,sort_order").in("program_id", programs.map((program) => program.id)).order("sort_order");
  if (requirementError || !requirements) return { data: null, error: requirementError };
  return {
    data: programs.map((program) => ({
      id: program.id,
      name: program.name,
      requirements: requirements.filter((item) => item.program_id === program.id).map(apiRequirement),
      createdAt: program.created_at,
    })),
    error: null,
  };
}

async function canUseProgram(programId: string, ownerId: string, isSuperuser: boolean) {
  let query = databaseClient.from("social_access_programs").select("id").eq("id", programId);
  if (!isSuperuser) query = query.eq("owner_id", ownerId);
  const { data, error } = await query.maybeSingle();
  return !error && Boolean(data);
}

async function saveRequirements(programId: string, requirements: z.infer<typeof requirementSchema>[]) {
  const { error: deleteError } = await databaseClient.from("social_requirements").delete().eq("program_id", programId);
  if (deleteError) return deleteError;
  if (!requirements.length) return null;
  const { error } = await databaseClient.from("social_requirements").insert(requirements.map((item, index) => ({
    program_id: programId,
    network: item.network,
    action_type: item.actionType,
    page_name: item.pageName,
    page_url: item.pageUrl,
    sort_order: index,
  })));
  return error;
}

socialProgramsRouter.get("/", async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const { data, error } = await loadPrograms(req.account!.id, req.account!.role === "superuser");
  if (error?.code === "PGRST205") return res.status(503).json({ error: { code: "votings_migration_required", message: "Falta aplicar en Supabase la migración 202610210003_create_votings.sql para configurar ternas y programas sociales." } });
  if (error) return res.status(500).json({ error: { code: "social_programs_load_failed", message: "No se pudieron cargar los programas sociales." } });
  return res.json({ data });
});

socialProgramsRouter.post("/", requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const parsed = programSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "validation_failed", message: "Revisa el programa social.", details: parsed.error.flatten() } });
  const { data: program, error } = await databaseClient.from("social_access_programs").insert({ owner_id: req.account!.id, name: parsed.data.name })
    .select("id,name,created_at").single();
  if (error || !program) return res.status(500).json({ error: { code: "social_program_create_failed", message: "No se pudo crear el programa social." } });
  const requirementError = await saveRequirements(program.id, parsed.data.requirements);
  if (requirementError) {
    await databaseClient.from("social_access_programs").delete().eq("id", program.id);
    return res.status(500).json({ error: { code: "social_requirements_save_failed", message: "No se pudieron guardar los requisitos sociales." } });
  }
  const { data: refreshed } = await loadPrograms(req.account!.id, req.account!.role === "superuser");
  return res.status(201).json({ data: refreshed?.find((item) => item.id === program.id) ?? { id: program.id, name: program.name, requirements: [] } });
});

socialProgramsRouter.put("/:id", requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const programId = z.uuid().safeParse(req.params.id);
  if (!programId.success) return res.status(400).json({ error: { code: "invalid_program_id", message: "El identificador del programa no es válido." } });
  const parsed = programSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "validation_failed", message: "Revisa el programa social.", details: parsed.error.flatten() } });
  const canUse = await canUseProgram(programId.data, req.account!.id, req.account!.role === "superuser");
  if (!canUse) return res.status(404).json({ error: { code: "social_program_not_found", message: "No encontramos ese programa social." } });

  const { data: publishedBallots, error: ballotError } = await databaseClient.from("ballots").select("id").eq("social_program_id", programId.data).eq("status", "published").limit(1);
  if (ballotError) return res.status(500).json({ error: { code: "social_program_check_failed", message: "No se pudo comprobar el uso del programa." } });
  if (publishedBallots?.length) return res.status(409).json({ error: { code: "social_program_in_use", message: "No edites un programa asociado a una votación publicada." } });

  const { error } = await databaseClient.from("social_access_programs").update({ name: parsed.data.name, updated_at: new Date().toISOString() }).eq("id", programId.data);
  if (error) return res.status(500).json({ error: { code: "social_program_update_failed", message: "No se pudo actualizar el programa social." } });
  const requirementError = await saveRequirements(programId.data, parsed.data.requirements);
  if (requirementError) return res.status(500).json({ error: { code: "social_requirements_save_failed", message: "No se pudieron guardar los requisitos sociales." } });
  const { data: refreshed } = await loadPrograms(req.account!.id, req.account!.role === "superuser");
  return res.json({ data: refreshed?.find((item) => item.id === programId.data) });
});

socialProgramsRouter.delete("/:id", requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const programId = z.uuid().safeParse(req.params.id);
  if (!programId.success) return res.status(400).json({ error: { code: "invalid_program_id", message: "El identificador del programa no es válido." } });
  const canUse = await canUseProgram(programId.data, req.account!.id, req.account!.role === "superuser");
  if (!canUse) return res.status(404).json({ error: { code: "social_program_not_found", message: "No encontramos ese programa social." } });
  const { count, error: countError } = await databaseClient.from("ballots").select("id", { count: "exact", head: true }).eq("social_program_id", programId.data);
  if (countError) return res.status(500).json({ error: { code: "social_program_check_failed", message: "No se pudo comprobar el uso del programa." } });
  if (count) return res.status(409).json({ error: { code: "social_program_in_use", message: "Desvincula el programa de las ternas antes de eliminarlo." } });
  const { error } = await databaseClient.from("social_access_programs").delete().eq("id", programId.data);
  if (error) return res.status(500).json({ error: { code: "social_program_delete_failed", message: "No se pudo eliminar el programa social." } });
  return res.status(204).send();
});

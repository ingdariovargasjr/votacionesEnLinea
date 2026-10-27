import { Router, type Request } from "express";
import { z } from "zod";
import { config, hasSupabaseConfig } from "../config.js";
import { verifyEmbedToken } from "../lib/embed-token.js";
import { createParticipantToken, verifyParticipantToken } from "../lib/participant-token.js";
import { requireAccount } from "../middleware/account-auth.js";
import { databaseClient } from "../supabase.js";
import { submitVoteSchema, validateAssignmentsForBallot } from "../schemas/votes.js";
import { socialConfirmationSchema } from "../schemas/social-confirmations.js";

export const publicVotingsRouter = Router();

const snapshotSchema = z.object({
  title: z.string(),
  description: z.string(),
  votingMode: z.enum(["single_daily", "five_daily"]),
  socialProgramId: z.uuid().nullable(),
  nominees: z.array(z.object({
    id: z.uuid(),
    name: z.string(),
    imagePath: z.string().nullable(),
    sortOrder: z.number().int(),
  }).strict()),
}).strict();

async function loadVoteContext(publicId: string) {
  const { data: version, error: versionError } = await databaseClient.from("ballot_versions")
    .select("id,ballot_id,public_id,status,is_current,snapshot")
    .eq("public_id", publicId).maybeSingle();
  if (versionError || !version) return { context: null, status: versionError ? 500 : 404, error: "No encontramos una versión publicada." };
  const snapshot = snapshotSchema.safeParse(version.snapshot);
  if (!snapshot.success) return { context: null, status: 500, error: "La configuración publicada no es válida." };

  const { data: ballot, error: ballotError } = await databaseClient.from("ballots")
    .select("id,event_id,status").eq("id", version.ballot_id).maybeSingle();
  if (ballotError || !ballot) return { context: null, status: ballotError ? 500 : 404, error: "No encontramos esa votación." };
  const { data: event, error: eventError } = await databaseClient.from("events")
    .select("id,status,timezone,allowed_embed_origins")
    .eq("id", ballot.event_id).maybeSingle();
  if (eventError || !event) return { context: null, status: eventError ? 500 : 404, error: "No encontramos esa gala." };
  return { context: { version, ballot, event, snapshot: snapshot.data }, status: 200, error: null };
}

async function authorizedEmbedContext(publicId: string, req: Request) {
  const loaded = await loadVoteContext(publicId);
  if (!loaded.context) return { context: null, status: loaded.status, error: loaded.error };
  const origin = req.get("x-embedder-origin") ?? "";
  const token = req.get("x-embedder-token") ?? "";
  let validOrigin = "";
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.origin === origin) validOrigin = parsedOrigin.origin;
  } catch { /* origin is required */ }
  if (!validOrigin || !(loaded.context.event.allowed_embed_origins ?? []).includes(validOrigin)) {
    return { context: null, status: 403, error: "El dominio anfitrión no está autorizado para esta gala." };
  }
  if (!verifyEmbedToken(token, publicId, validOrigin, config.supabaseServiceRoleKey)) {
    return { context: null, status: 403, error: "La sesión del widget expiró. Recarga la página anfitriona." };
  }
  return { context: loaded.context, status: 200, error: null };
}

async function authorizedParticipantContext(publicId: string, req: Request) {
  const identity = verifyParticipantToken(req.get("x-participant-token") ?? "", config.supabaseServiceRoleKey);
  if (!identity) return { context: null, identity: null, status: 401, error: "No se encontró una identidad válida de este navegador." };
  const loaded = await loadVoteContext(publicId);
  if (!loaded.context) return { context: null, identity: null, status: loaded.status, error: loaded.error };
  if (!(loaded.context.event.allowed_embed_origins ?? []).includes(identity.embedderOrigin)) {
    return { context: null, identity: null, status: 403, error: "El dominio anfitrión ya no está autorizado para esta gala." };
  }
  return { context: loaded.context, identity, status: 200, error: null };
}

function voteRpcError(error: { code?: string; message: string }) {
  if (error.code === "PGRST202") return { status: 503, code: "votes_migration_required", message: "Falta aplicar la migración 202610210007_record_ballot_votes.sql." };
  if (error.message.includes("voting_version_not_found")) return { status: 404, code: "public_voting_not_found", message: "No encontramos la versión de esta votación." };
  if (error.message.includes("voting_closed")) return { status: 409, code: "voting_closed", message: "Esta votación ya no recibe votos." };
  if (error.message.includes("daily_vote_limit_reached")) return { status: 409, code: "daily_vote_limit_reached", message: "Ya registraste tu voto de hoy en esta terna." };
  if (error.message.includes("social_access_required")) return { status: 403, code: "social_access_required", message: "Necesitas habilitar el acceso social de esta terna antes de enviar los cinco votos." };
  if (error.message.includes("idempotency_key_conflict")) return { status: 409, code: "idempotency_key_conflict", message: "La clave de envío ya se utilizó con otra selección." };
  if (error.message.includes("nominee_not_in_published_version")) return { status: 400, code: "nominee_not_in_published_version", message: "Uno de los nominados ya no pertenece a esta versión publicada." };
  if (error.message.includes("single_vote_requires_one_assignment")) return { status: 400, code: "single_vote_requires_one_assignment", message: "Selecciona exactamente un nominado." };
  if (error.message.includes("five_votes_require_exactly_five")) return { status: 400, code: "five_votes_require_exactly_five", message: "Distribuye exactamente cinco votos antes de enviar." };
  if (error.message.includes("invalid_vote_assignments") || error.message.includes("duplicate_vote_nominee")) return { status: 400, code: "invalid_vote_assignments", message: "Las asignaciones de votos no son válidas." };
  return { status: 500, code: "vote_request_failed", message: "No se pudo procesar el voto. Inténtalo nuevamente." };
}

async function loadParticipantSocialAccess(programId: string | null, participantId: string) {
  if (!programId) return { data: null, error: null };
  const [programResult, requirementsResult, accessResult, confirmationsResult] = await Promise.all([
    databaseClient.from("social_access_programs").select("id,name").eq("id", programId).maybeSingle(),
    databaseClient.from("social_requirements")
      .select("id,network,action_type,page_name,page_url,sort_order")
      .eq("program_id", programId).order("sort_order", { ascending: true }),
    databaseClient.from("participant_social_access")
      .select("confirmed_at,confirmation_method")
      .eq("participant_id", participantId).eq("program_id", programId).maybeSingle(),
    databaseClient.from("participant_social_requirement_confirmations")
      .select("requirement_id,confirmed_at")
      .eq("participant_id", participantId).eq("program_id", programId),
  ]);
  const error = programResult.error ?? requirementsResult.error ?? accessResult.error ?? confirmationsResult.error;
  if (error) return { data: null, error };
  const confirmedAtByRequirement = new Map((confirmationsResult.data ?? []).map((item) => [item.requirement_id, item.confirmed_at]));
  return {
    data: {
      programId,
      programName: programResult.data?.name ?? "Programa social",
      accessGranted: Boolean(accessResult.data),
      confirmedAt: accessResult.data?.confirmed_at ?? null,
      confirmationMethod: accessResult.data?.confirmation_method ?? "manual",
      requirements: (requirementsResult.data ?? []).map((item) => ({
        id: item.id,
        network: item.network,
        actionType: item.action_type,
        pageName: item.page_name,
        pageUrl: item.page_url,
        sortOrder: item.sort_order,
        confirmedAt: confirmedAtByRequirement.get(item.id) ?? null,
      })),
    },
    error: null,
  };
}

function socialConfirmationRpcError(error: { code?: string; message: string }) {
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42P01") {
    return { status: 503, code: "social_confirmation_migration_required", message: "Falta aplicar la migración 202610210009_manual_social_confirmations.sql." };
  }
  if (error.message.includes("social_program_not_found")) return { status: 404, code: "social_program_not_found", message: "No encontramos el programa social asociado." };
  if (error.message.includes("social_requirements_not_configured")) return { status: 409, code: "social_requirements_not_configured", message: "Este programa todavía no tiene requisitos sociales configurados." };
  if (error.message.includes("social_requirement_set_mismatch")) return { status: 400, code: "social_requirement_set_mismatch", message: "Confirma cada uno de los requisitos actuales del programa." };
  return { status: 500, code: "social_confirmation_failed", message: "No se pudo guardar la confirmación social." };
}

function unavailable(res: import("express").Response) {
  return res.status(503).json({ error: { code: "database_not_configured", message: "Configura las variables de Supabase en el API." } });
}

async function loadPublishedVersion(publicId: string, req: Request, adminPreview: boolean) {
  const { data: version, error: versionError } = await databaseClient.from("ballot_versions")
    .select("id,ballot_id,public_id,version_number,status,is_current,snapshot")
    .eq("public_id", publicId).maybeSingle();
  if (versionError || !version) return { status: versionError ? 500 : 404, error: "No encontramos una versión publicada." };
  const parsedSnapshot = snapshotSchema.safeParse(version.snapshot);
  if (!parsedSnapshot.success) return { status: 500, error: "La versión publicada no tiene una configuración válida." };

  const { data: ballot, error: ballotError } = await databaseClient.from("ballots").select("id,event_id,status").eq("id", version.ballot_id).maybeSingle();
  if (ballotError || !ballot) return { status: ballotError ? 500 : 404, error: "No encontramos esa votación." };
  let eventQuery = databaseClient.from("events")
    .select("id,name,status,timezone,allowed_embed_origins,theme_primary_color,theme_secondary_color,theme_font_family")
    .eq("id", ballot.event_id);
  if (adminPreview && req.account?.role !== "superuser") eventQuery = eventQuery.eq("owner_id", req.account!.id);
  const { data: event, error: eventError } = await eventQuery.maybeSingle();
  if (eventError || !event) return { status: eventError ? 500 : 404, error: "No encontramos esa gala." };

  if (!adminPreview) {
    const suppliedOrigin = req.get("x-embedder-origin");
    const suppliedToken = req.get("x-embedder-token") ?? "";
    let normalizedOrigin = "";
    try {
      const parsedOrigin = new URL(suppliedOrigin ?? "");
      if (parsedOrigin.origin === suppliedOrigin) normalizedOrigin = parsedOrigin.origin;
    } catch { /* missing or invalid origin */ }
    if (!normalizedOrigin || !(event.allowed_embed_origins ?? []).includes(normalizedOrigin)) {
      return { status: 403, error: "Esta gala todavía no permite ese dominio. Pide al administrador que configure el host del iframe." };
    }
    if (!verifyEmbedToken(suppliedToken, publicId, normalizedOrigin, config.supabaseServiceRoleKey)) {
      return { status: 403, error: "No se pudo validar el origen autorizado de este widget. Vuelve a cargarlo desde la página de la gala." };
    }
  }

  const snapshot = parsedSnapshot.data;
  const nominees = await Promise.all(snapshot.nominees.map(async (nominee) => {
    let imageUrl: string | null = null;
    if (nominee.imagePath) {
      try {
        const { data } = await databaseClient.storage.from("nominee-images").createSignedUrl(nominee.imagePath, 60 * 60);
        imageUrl = data?.signedUrl ?? null;
      } catch { /* la imagen es opcional; el widget mostrará el avatar de respaldo */ }
    }
    return { id: nominee.id, name: nominee.name, imageUrl, sortOrder: nominee.sortOrder };
  }));

  return {
    status: 200,
    data: {
      publicId: version.public_id,
      version: version.version_number,
      status: event.status === "closed" || ballot.status === "closed" ? "closed" : version.status,
      canVote: version.status === "published" && version.is_current && ballot.status === "published" && event.status === "published",
      eventName: event.name,
      timezone: event.timezone,
      title: snapshot.title,
      description: snapshot.description,
      votingMode: snapshot.votingMode,
      socialProgramId: snapshot.socialProgramId,
      nominees,
      theme: {
        primaryColor: event.theme_primary_color,
        secondaryColor: event.theme_secondary_color,
        fontFamily: event.theme_font_family,
      },
    },
  };
}

publicVotingsRouter.get("/votings/:publicId", async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  res.set("Cache-Control", "no-store");
  const publicId = z.uuid().safeParse(req.params.publicId);
  if (!publicId.success) return res.status(404).json({ error: { code: "public_voting_not_found", message: "No encontramos una versión publicada." } });
  const result = await loadPublishedVersion(publicId.data, req, false);
  if ("error" in result) return res.status(result.status).json({ error: { code: "public_voting_unavailable", message: result.error } });
  return res.json({ data: result.data });
});

publicVotingsRouter.post("/votings/:publicId/participant", async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  res.set("Cache-Control", "no-store");
  const publicId = z.uuid().safeParse(req.params.publicId);
  if (!publicId.success) return res.status(404).json({ error: { code: "public_voting_not_found", message: "No encontramos una versión publicada." } });
  const authorized = await authorizedEmbedContext(publicId.data, req);
  if (!authorized.context) return res.status(authorized.status).json({ error: { code: "embed_not_authorized", message: authorized.error } });
  const requestedIdentity = z.object({ participantToken: z.string().min(1).max(2048).optional() }).strict().safeParse(req.body ?? {});
  if (!requestedIdentity.success) return res.status(400).json({ error: { code: "invalid_participant_identity", message: "No se pudo preparar la identidad anónima del navegador." } });
  const inheritedIdentity = requestedIdentity.data.participantToken
    ? verifyParticipantToken(requestedIdentity.data.participantToken, config.supabaseServiceRoleKey)
    : null;
  if (requestedIdentity.data.participantToken && !inheritedIdentity) {
    return res.status(401).json({ error: { code: "participant_identity_required", message: "La identidad anónima anterior ya no es válida." } });
  }
  const { version, ballot, event } = authorized.context;
  if (version.status !== "published" || !version.is_current || ballot.status !== "published" || event.status !== "published") {
    return res.status(409).json({ error: { code: "voting_closed", message: "Esta votación ya no recibe votos." } });
  }
  return res.status(201).json({ data: createParticipantToken(req.get("x-embedder-origin")!, config.supabaseServiceRoleKey, inheritedIdentity?.participantId) });
});

publicVotingsRouter.get("/votings/:publicId/vote-status", async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  res.set("Cache-Control", "no-store");
  const publicId = z.uuid().safeParse(req.params.publicId);
  if (!publicId.success) return res.status(404).json({ error: { code: "public_voting_not_found", message: "No encontramos una versión publicada." } });
  const authorized = await authorizedParticipantContext(publicId.data, req);
  if (!authorized.context || !authorized.identity) {
    const code = authorized.status === 401 ? "participant_identity_required" : authorized.status === 403 ? "embed_not_authorized" : "public_voting_unavailable";
    return res.status(authorized.status).json({ error: { code, message: authorized.error } });
  }
  const { data, error } = await databaseClient.rpc("get_ballot_vote_status", {
    p_public_id: publicId.data,
    p_participant_id: authorized.identity.participantId,
  });
  if (error) {
    const mapped = voteRpcError(error);
    return res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
  }
  const socialResult = await loadParticipantSocialAccess(
    authorized.context.snapshot.socialProgramId,
    authorized.identity.participantId,
  );
  if (socialResult.error) {
    const mapped = socialConfirmationRpcError(socialResult.error);
    return res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
  }
  return res.json({ data: { ...data, socialProgram: socialResult.data } });
});

publicVotingsRouter.post("/votings/:publicId/social-access/confirm", async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  res.set("Cache-Control", "no-store");
  const publicId = z.uuid().safeParse(req.params.publicId);
  if (!publicId.success) return res.status(404).json({ error: { code: "public_voting_not_found", message: "No encontramos una versión publicada." } });
  const authorized = await authorizedParticipantContext(publicId.data, req);
  if (!authorized.context || !authorized.identity) {
    const code = authorized.status === 401 ? "participant_identity_required" : authorized.status === 403 ? "embed_not_authorized" : "public_voting_unavailable";
    return res.status(authorized.status).json({ error: { code, message: authorized.error } });
  }
  const parsed = socialConfirmationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid_social_confirmation", message: "Selecciona todos los requisitos antes de confirmar." } });
  const { version, ballot, event, snapshot } = authorized.context;
  if (snapshot.votingMode !== "five_daily" || !snapshot.socialProgramId) {
    return res.status(409).json({ error: { code: "social_program_not_required", message: "Esta votación no requiere un programa social." } });
  }
  if (version.status !== "published" || !version.is_current || ballot.status !== "published" || event.status !== "published") {
    return res.status(409).json({ error: { code: "voting_closed", message: "Esta votación ya no recibe votos." } });
  }

  const { error } = await databaseClient.rpc("confirm_participant_social_access", {
    p_participant_id: authorized.identity.participantId,
    p_program_id: snapshot.socialProgramId,
    p_requirement_ids: parsed.data.requirementIds,
  });
  if (error) {
    const mapped = socialConfirmationRpcError(error);
    return res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
  }
  const socialResult = await loadParticipantSocialAccess(snapshot.socialProgramId, authorized.identity.participantId);
  if (socialResult.error) {
    const mapped = socialConfirmationRpcError(socialResult.error);
    return res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
  }
  return res.json({ data: socialResult.data });
});

publicVotingsRouter.post("/votings/:publicId/votes", async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  res.set("Cache-Control", "no-store");
  const publicId = z.uuid().safeParse(req.params.publicId);
  if (!publicId.success) return res.status(404).json({ error: { code: "public_voting_not_found", message: "No encontramos una versión publicada." } });
  const authorized = await authorizedParticipantContext(publicId.data, req);
  if (!authorized.context || !authorized.identity) {
    const code = authorized.status === 401 ? "participant_identity_required" : authorized.status === 403 ? "embed_not_authorized" : "public_voting_unavailable";
    return res.status(authorized.status).json({ error: { code, message: authorized.error } });
  }
  const parsed = submitVoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid_vote_request", message: "Revisa las asignaciones antes de enviar.", details: parsed.error.flatten() } });
  const valid = validateAssignmentsForBallot(
    parsed.data.assignments,
    authorized.context.snapshot.votingMode,
    new Set(authorized.context.snapshot.nominees.map((nominee) => nominee.id)),
  );
  if (valid) {
    const mapped = voteRpcError({ message: valid });
    return res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
  }

  const { data, error } = await databaseClient.rpc("submit_ballot_votes", {
    p_public_id: publicId.data,
    p_participant_id: authorized.identity.participantId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_assignments: parsed.data.assignments,
  });
  if (error) {
    const mapped = voteRpcError(error);
    return res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
  }
  return res.status(201).json({ data });
});

publicVotingsRouter.get("/voting-versions/preview/:publicId", requireAccount, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  res.set("Cache-Control", "no-store");
  const publicId = z.uuid().safeParse(req.params.publicId);
  if (!publicId.success) return res.status(404).json({ error: { code: "voting_version_not_found", message: "No encontramos esa versión." } });
  const result = await loadPublishedVersion(publicId.data, req, true);
  if ("error" in result) return res.status(result.status).json({ error: { code: "voting_version_not_found", message: result.error } });
  return res.json({ data: result.data });
});

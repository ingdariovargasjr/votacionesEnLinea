import { Router, type Response } from "express";
import { z } from "zod";
import { hasSupabaseConfig } from "../config.js";
import { requireAccount, requirePaidPlan } from "../middleware/account-auth.js";
import { createBallotSchema, updateBallotSchema } from "../schemas/votings.js";
import { databaseClient } from "../supabase.js";

export const votingsRouter = Router();

type ApiAccount = NonNullable<Express.Request["account"]>;

function unavailable(res: Response) {
  return res.status(503).json({ error: { code: "database_not_configured", message: "Configura Supabase en el API." } });
}

async function accessibleEvent(eventId: string, account: ApiAccount) {
  let query = databaseClient.from("events").select("id,owner_id,status").eq("id", eventId);
  if (account.role !== "superuser") query = query.eq("owner_id", account.id);
  return query.maybeSingle();
}

async function accessibleProgram(programId: string | null, account: ApiAccount) {
  if (!programId) return true;
  let query = databaseClient.from("social_access_programs").select("id").eq("id", programId);
  if (account.role !== "superuser") query = query.eq("owner_id", account.id);
  const { data, error } = await query.maybeSingle();
  return !error && Boolean(data);
}

async function loadBallot(ballotId: string) {
  const { data: ballot, error } = await databaseClient.from("ballots")
    .select("id,public_id,event_id,title,description,voting_mode,social_program_id,status,sort_order,created_at,updated_at")
    .eq("id", ballotId).maybeSingle();
  if (error || !ballot) return { data: null, error };
  const { data: versions, error: versionError } = await databaseClient.from("ballot_versions")
    .select("id,public_id,version_number,status,is_current,published_at,source_updated_at,snapshot")
    .eq("ballot_id", ballotId).order("version_number", { ascending: false });
  if (versionError || !versions) return { data: null, error: versionError };
  const { data: nominees, error: nomineeError } = await databaseClient.from("nominees")
    .select("id,name,image_path,sort_order").eq("ballot_id", ballotId).order("sort_order").order("created_at");
  if (nomineeError || !nominees) return { data: null, error: nomineeError };
  const { data: fighterLinks, error: fighterLinkError } = nominees.length
    ? await databaseClient.from("event_nominee_fighters").select("nominee_id,fighter_id")
      .eq("event_id", ballot.event_id).in("nominee_id", nominees.map((nominee) => nominee.id))
    : { data: [], error: null };
  if (fighterLinkError || !fighterLinks) return { data: null, error: fighterLinkError };
  const fighterIdByNomineeId = new Map(fighterLinks.map((link) => [link.nominee_id, link.fighter_id]));
  const currentVersion = versions.find((version) => version.is_current);
  const currentSnapshot = {
    title: ballot.title,
    description: ballot.description,
    votingMode: ballot.voting_mode,
    socialProgramId: ballot.social_program_id,
    nominees: nominees.map((nominee) => ({ id: nominee.id, name: nominee.name, imagePath: nominee.image_path, sortOrder: nominee.sort_order })),
  };
  const stableJson = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
    return JSON.stringify(value) ?? "null";
  };
  return {
    data: {
      id: ballot.id,
      publicId: currentVersion?.public_id ?? null,
      eventId: ballot.event_id,
      title: ballot.title,
      description: ballot.description,
      votingMode: ballot.voting_mode,
      socialProgramId: ballot.social_program_id,
      status: ballot.status,
      sortOrder: ballot.sort_order,
      currentVersion: currentVersion?.version_number ?? null,
      hasUnpublishedChanges: currentVersion ? stableJson(currentVersion.snapshot) !== stableJson(currentSnapshot) : false,
      versions: versions.map((version) => ({
        id: version.id,
        publicId: version.public_id,
        versionNumber: version.version_number,
        status: version.status,
        isCurrent: version.is_current,
        publishedAt: version.published_at,
      })),
      nominees: await Promise.all(nominees.map(async (nominee) => {
        let imageUrl: string | null = null;
        if (nominee.image_path) {
          const { data } = await databaseClient.storage.from("nominee-images").createSignedUrl(nominee.image_path, 60 * 60);
          imageUrl = data?.signedUrl ?? null;
        }
        return {
          id: nominee.id,
          name: nominee.name,
          imagePath: nominee.image_path,
          imageUrl,
          sortOrder: nominee.sort_order,
          eventFighterId: fighterIdByNomineeId.get(nominee.id) ?? null,
        };
      })),
    },
    error: null,
  };
}

async function replaceNominees(ballotId: string, nominees: { id?: string; name: string; eventFighterId?: string | null }[]) {
  const { error: rpcError } = await databaseClient.rpc("replace_ballot_nominees_with_fighters", {
    p_ballot_id: ballotId,
    p_nominees: nominees.map((nominee, index) => ({
      ...(nominee.id ? { id: nominee.id } : {}),
      name: nominee.name,
      sortOrder: index,
      eventFighterId: nominee.eventFighterId ?? null,
    })),
  });
  if (rpcError?.code === "PGRST202") return { ...rpcError, message: "fighter_identity_migration_required" };
  return rpcError;
}

votingsRouter.get("/events/:eventId/votings", requireAccount, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const eventId = z.uuid().safeParse(req.params.eventId);
  if (!eventId.success) return res.status(400).json({ error: { code: "invalid_event_id", message: "El identificador de la gala no es válido." } });
  const { data: event, error: eventError } = await accessibleEvent(eventId.data, req.account!);
  if (eventError) return res.status(500).json({ error: { code: "event_check_failed", message: "No se pudo cargar la gala." } });
  if (!event) return res.status(404).json({ error: { code: "event_not_found", message: "No encontramos esa gala." } });

  const { data: ballots, error } = await databaseClient.from("ballots")
    .select("id,public_id,event_id,title,description,voting_mode,social_program_id,status,sort_order,created_at,updated_at")
    .eq("event_id", eventId.data).order("sort_order").order("created_at");
  if (error?.code === "PGRST205") return res.status(503).json({ error: { code: "votings_migration_required", message: "Falta aplicar en Supabase la migración 202610210003_create_votings.sql para configurar ternas y nominados." } });
  if (error || !ballots) return res.status(500).json({ error: { code: "votings_load_failed", message: "No se pudieron cargar las ternas." } });
  const result = await Promise.all(ballots.map(async (ballot) => (await loadBallot(ballot.id)).data));
  if (result.some((item) => !item)) return res.status(500).json({ error: { code: "nominees_load_failed", message: "No se pudieron cargar los nominados." } });
  return res.json({ data: result });
});

votingsRouter.post("/events/:eventId/votings", requireAccount, requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const eventId = z.uuid().safeParse(req.params.eventId);
  if (!eventId.success) return res.status(400).json({ error: { code: "invalid_event_id", message: "El identificador de la gala no es válido." } });
  const parsed = createBallotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "validation_failed", message: "Revisa los datos de la votación.", details: parsed.error.flatten() } });
  const { data: event, error: eventError } = await accessibleEvent(eventId.data, req.account!);
  if (eventError) return res.status(500).json({ error: { code: "event_check_failed", message: "No se pudo comprobar la gala." } });
  if (!event) return res.status(404).json({ error: { code: "event_not_found", message: "No encontramos esa gala." } });
  if (event.status === "closed") return res.status(409).json({ error: { code: "event_closed", message: "No se pueden crear ternas en una gala cerrada." } });
  if (!await accessibleProgram(parsed.data.socialProgramId, req.account!)) return res.status(400).json({ error: { code: "social_program_not_available", message: "El programa social no está disponible para esta cuenta." } });

  const { data: lastBallot } = await databaseClient.from("ballots").select("sort_order").eq("event_id", eventId.data).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data: ballot, error } = await databaseClient.from("ballots").insert({
    event_id: eventId.data,
    title: parsed.data.title,
    description: parsed.data.description,
    voting_mode: parsed.data.votingMode,
    social_program_id: parsed.data.socialProgramId,
    sort_order: (lastBallot?.sort_order ?? -1) + 1,
    status: "draft",
  }).select("id").single();
  if (error || !ballot) return res.status(500).json({ error: { code: "voting_create_failed", message: "No se pudo crear la terna." } });
  const loaded = await loadBallot(ballot.id);
  if (loaded.error || !loaded.data) return res.status(500).json({ error: { code: "voting_load_failed", message: "La terna se creó, pero no se pudo cargar." } });
  return res.status(201).json({ data: loaded.data });
});

votingsRouter.post("/votings/:ballotId/publish", requireAccount, requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const ballotId = z.uuid().safeParse(req.params.ballotId);
  if (!ballotId.success) return res.status(400).json({ error: { code: "invalid_voting_id", message: "El identificador de la votación no es válido." } });
  const { data: ballot, error: ballotError } = await databaseClient.from("ballots").select("id,event_id,status").eq("id", ballotId.data).maybeSingle();
  if (ballotError) return res.status(500).json({ error: { code: "voting_check_failed", message: "No se pudo comprobar la votación." } });
  if (!ballot) return res.status(404).json({ error: { code: "voting_not_found", message: "No encontramos esa votación." } });
  if (ballot.status === "closed") return res.status(409).json({ error: { code: "voting_closed", message: "Una votación retirada no se puede volver a publicar; crea una nueva versión de trabajo." } });
  const { data: event, error: eventError } = await accessibleEvent(ballot.event_id, req.account!);
  if (eventError) return res.status(500).json({ error: { code: "event_check_failed", message: "No se pudo comprobar la gala." } });
  if (!event) return res.status(404).json({ error: { code: "voting_not_found", message: "No encontramos esa votación." } });
  if (event.status === "closed") return res.status(409).json({ error: { code: "event_closed", message: "No se pueden publicar ternas en una gala cerrada." } });
  const { data: nominees, error: nomineeError } = await databaseClient.from("nominees").select("id").eq("ballot_id", ballotId.data);
  if (nomineeError) return res.status(500).json({ error: { code: "nominees_check_failed", message: "No se pudieron validar los nominados." } });
  if (!nominees || nominees.length < 2) return res.status(400).json({ error: { code: "publication_requires_two_nominees", message: "Añade al menos dos nominados antes de publicar." } });

  const { error } = await databaseClient.rpc("publish_ballot_version", { p_ballot_id: ballotId.data });
  if (error?.code === "PGRST202") return res.status(503).json({ error: { code: "publication_migration_required", message: "Falta aplicar la migración 202610210006_publish_ballot_versions.sql." } });
  if (error?.message.includes("at_least_two_nominees_required")) return res.status(400).json({ error: { code: "publication_requires_two_nominees", message: "Añade al menos dos nominados antes de publicar." } });
  if (error?.message.includes("ballot_closed") || error?.message.includes("event_closed")) return res.status(409).json({ error: { code: "voting_closed", message: "Esta votación o gala está cerrada." } });
  if (error) return res.status(500).json({ error: { code: "voting_publish_failed", message: "No se pudo publicar la votación." } });
  const loaded = await loadBallot(ballotId.data);
  if (loaded.error || !loaded.data) return res.status(500).json({ error: { code: "voting_load_failed", message: "La votación se publicó, pero no se pudo cargar su versión." } });
  return res.json({ data: loaded.data });
});

votingsRouter.post("/votings/:ballotId/retire", requireAccount, requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const ballotId = z.uuid().safeParse(req.params.ballotId);
  if (!ballotId.success) return res.status(400).json({ error: { code: "invalid_voting_id", message: "El identificador de la votación no es válido." } });
  const { data: ballot, error: ballotError } = await databaseClient.from("ballots").select("id,event_id,status").eq("id", ballotId.data).maybeSingle();
  if (ballotError) return res.status(500).json({ error: { code: "voting_check_failed", message: "No se pudo comprobar la votación." } });
  if (!ballot) return res.status(404).json({ error: { code: "voting_not_found", message: "No encontramos esa votación." } });
  const { data: event, error: eventError } = await accessibleEvent(ballot.event_id, req.account!);
  if (eventError) return res.status(500).json({ error: { code: "event_check_failed", message: "No se pudo comprobar la gala." } });
  if (!event) return res.status(404).json({ error: { code: "voting_not_found", message: "No encontramos esa votación." } });
  if (ballot.status !== "published") return res.status(409).json({ error: { code: "voting_not_published", message: "Solo puedes retirar una votación publicada." } });

  const { error } = await databaseClient.rpc("close_ballot_version", { p_ballot_id: ballotId.data });
  if (error) return res.status(500).json({ error: { code: "voting_retire_failed", message: "No se pudo retirar la votación." } });
  const loaded = await loadBallot(ballotId.data);
  if (loaded.error || !loaded.data) return res.status(500).json({ error: { code: "voting_load_failed", message: "La votación se retiró, pero no se pudo cargar su historial." } });
  return res.json({ data: loaded.data });
});

votingsRouter.put("/votings/:ballotId", requireAccount, requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const ballotId = z.uuid().safeParse(req.params.ballotId);
  if (!ballotId.success) return res.status(400).json({ error: { code: "invalid_voting_id", message: "El identificador de la votación no es válido." } });
  const parsed = updateBallotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "validation_failed", message: "Revisa la terna y sus nominados.", details: parsed.error.flatten() } });
  const { data: ballot, error: ballotError } = await databaseClient.from("ballots")
    .select("id,event_id,status").eq("id", ballotId.data).maybeSingle();
  if (ballotError) return res.status(500).json({ error: { code: "voting_check_failed", message: "No se pudo comprobar la votación." } });
  if (!ballot) return res.status(404).json({ error: { code: "voting_not_found", message: "No encontramos esa votación." } });
  const { data: event, error: eventError } = await accessibleEvent(ballot.event_id, req.account!);
  if (eventError) return res.status(500).json({ error: { code: "event_check_failed", message: "No se pudo comprobar la gala." } });
  if (!event) return res.status(404).json({ error: { code: "voting_not_found", message: "No encontramos esa votación." } });
  if (ballot.status === "closed" || event.status === "closed") return res.status(409).json({ error: { code: "voting_not_editable", message: "No se pueden editar votaciones retiradas o galas cerradas." } });
  if (!await accessibleProgram(parsed.data.socialProgramId, req.account!)) return res.status(400).json({ error: { code: "social_program_not_available", message: "El programa social no está disponible para esta cuenta." } });

  const { error: updateError } = await databaseClient.from("ballots").update({
    title: parsed.data.title,
    description: parsed.data.description,
    voting_mode: parsed.data.votingMode,
    social_program_id: parsed.data.socialProgramId,
    updated_at: new Date().toISOString(),
  }).eq("id", ballotId.data);
  if (updateError) return res.status(500).json({ error: { code: "voting_update_failed", message: "No se pudo actualizar la terna." } });

  const nomineeError = await replaceNominees(ballotId.data, parsed.data.nominees);
  if (nomineeError?.message.includes("event_fighter_does_not_belong_to_event")) return res.status(400).json({ error: { code: "invalid_event_fighter", message: "Selecciona un luchador maestro de esta misma gala." } });
  if (nomineeError?.message.includes("fighter_identity_migration_required")) return res.status(503).json({ error: { code: "fighter_identity_migration_required", message: "Falta aplicar la migración 202610210011_gala_fighter_identities.sql." } });
  if (nomineeError) return res.status(500).json({ error: { code: "nominees_update_failed", message: "No se pudieron guardar los nominados. Revisa que la migración de votaciones esté aplicada." } });
  const loaded = await loadBallot(ballotId.data);
  if (loaded.error || !loaded.data) return res.status(500).json({ error: { code: "voting_load_failed", message: "No se pudo cargar la terna actualizada." } });
  return res.json({ data: loaded.data });
});

votingsRouter.delete("/votings/:ballotId", requireAccount, requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return unavailable(res);
  const ballotId = z.uuid().safeParse(req.params.ballotId);
  if (!ballotId.success) return res.status(400).json({ error: { code: "invalid_voting_id", message: "El identificador de la votación no es válido." } });
  const { data: ballot, error } = await databaseClient.from("ballots").select("id,event_id,status").eq("id", ballotId.data).maybeSingle();
  if (error) return res.status(500).json({ error: { code: "voting_check_failed", message: "No se pudo comprobar la votación." } });
  if (!ballot) return res.status(404).json({ error: { code: "voting_not_found", message: "No encontramos esa votación." } });
  const { data: event } = await accessibleEvent(ballot.event_id, req.account!);
  if (!event) return res.status(404).json({ error: { code: "voting_not_found", message: "No encontramos esa votación." } });
  if (ballot.status !== "draft" || event.status === "closed") return res.status(409).json({ error: { code: "voting_not_draft", message: "Solo se pueden eliminar ternas que todavía no se hayan publicado." } });
  const { error: deleteError } = await databaseClient.from("ballots").delete().eq("id", ballotId.data);
  if (deleteError) return res.status(500).json({ error: { code: "voting_delete_failed", message: "No se pudo eliminar la terna." } });
  return res.status(204).send();
});

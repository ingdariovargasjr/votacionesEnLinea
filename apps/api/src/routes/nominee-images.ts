import { raw, Router } from "express";
import { z } from "zod";
import { hasSupabaseConfig } from "../config.js";
import { requireAccount, requirePaidPlan } from "../middleware/account-auth.js";
import { imageHasExpectedSignature } from "../lib/image-validation.js";
import { databaseClient } from "../supabase.js";

export const nomineeImagesRouter = Router();

const bucket = "nominee-images";
const maxFileSize = 5 * 1024 * 1024;
const mimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type ApiAccount = NonNullable<Express.Request["account"]>;

async function editableNominee(nomineeId: string, account: ApiAccount) {
  const { data: nominee, error: nomineeError } = await databaseClient.from("nominees")
    .select("id,ballot_id,image_path").eq("id", nomineeId).maybeSingle();
  if (nomineeError) return { error: "No se pudo comprobar el nominado.", status: 500 as const };
  if (!nominee) return { error: "No encontramos ese nominado.", status: 404 as const };

  const { data: ballot, error: ballotError } = await databaseClient.from("ballots")
    .select("id,event_id,status").eq("id", nominee.ballot_id).maybeSingle();
  if (ballotError) return { error: "No se pudo comprobar la terna.", status: 500 as const };
  if (!ballot) return { error: "No encontramos ese nominado.", status: 404 as const };

  let eventQuery = databaseClient.from("events").select("id,owner_id,status").eq("id", ballot.event_id);
  if (account.role !== "superuser") eventQuery = eventQuery.eq("owner_id", account.id);
  const { data: event, error: eventError } = await eventQuery.maybeSingle();
  if (eventError) return { error: "No se pudo comprobar la gala.", status: 500 as const };
  if (!event) return { error: "No encontramos ese nominado.", status: 404 as const };
  if (ballot.status === "closed" || event.status === "closed") {
    return { error: "No puedes administrar imágenes de una votación retirada o una gala cerrada.", status: 409 as const };
  }

  return { nominee, ballot, error: null, status: 200 as const };
}

nomineeImagesRouter.put(
  "/:nomineeId/image",
  requireAccount,
  requirePaidPlan,
  raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }),
  async (req, res) => {
    if (!hasSupabaseConfig) return res.status(503).json({ error: { code: "database_not_configured", message: "Configura las variables de Supabase en el API." } });
    const nomineeId = z.uuid().safeParse(req.params.nomineeId);
    if (!nomineeId.success) return res.status(400).json({ error: { code: "invalid_nominee_id", message: "El identificador del nominado no es válido." } });

    const mimeType = req.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    const extension = mimeExtensions[mimeType];
    if (!extension || !Buffer.isBuffer(req.body)) return res.status(415).json({ error: { code: "unsupported_image_type", message: "Usa una imagen JPEG, PNG o WebP." } });
    if (!req.body.length || req.body.length > maxFileSize) return res.status(413).json({ error: { code: "image_too_large", message: "La imagen debe pesar más de 0 y como máximo 5 MB." } });
    if (!imageHasExpectedSignature(req.body, mimeType)) return res.status(415).json({ error: { code: "invalid_image_content", message: "El contenido del archivo no coincide con una imagen JPEG, PNG o WebP válida." } });

    const editable = await editableNominee(nomineeId.data, req.account!);
    if (editable.error || !editable.nominee) return res.status(editable.status).json({ error: { code: "nominee_not_editable", message: editable.error } });
    const path = `${editable.nominee.ballot_id}/${editable.nominee.id}.${extension}`;
    const { error: uploadError } = await databaseClient.storage.from(bucket).upload(path, req.body, {
      contentType: mimeType,
      upsert: true,
      cacheControl: "3600",
    });
    if (uploadError) return res.status(500).json({ error: { code: "image_upload_failed", message: "No se pudo guardar la imagen en Supabase Storage." } });

    const { data: signedUrl, error: signedUrlError } = await databaseClient.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (signedUrlError || !signedUrl) {
      if (path !== editable.nominee.image_path) await databaseClient.storage.from(bucket).remove([path]);
      return res.status(500).json({ error: { code: "image_access_failed", message: "La imagen se guardó, pero no se pudo generar su vista previa." } });
    }

    const { error: updateError } = await databaseClient.from("nominees").update({ image_path: path }).eq("id", nomineeId.data);
    if (updateError) {
      if (path !== editable.nominee.image_path) await databaseClient.storage.from(bucket).remove([path]);
      return res.status(500).json({ error: { code: "image_record_update_failed", message: "No se pudo asociar la imagen al nominado." } });
    }
    await databaseClient.from("ballots").update({ updated_at: new Date().toISOString() }).eq("id", editable.ballot.id);
    if (editable.nominee.image_path && editable.nominee.image_path !== path) {
      await databaseClient.storage.from(bucket).remove([editable.nominee.image_path]);
    }

    return res.json({ data: { imagePath: path, imageUrl: signedUrl.signedUrl } });
  },
);

nomineeImagesRouter.delete("/:nomineeId/image", requireAccount, requirePaidPlan, async (req, res) => {
  if (!hasSupabaseConfig) return res.status(503).json({ error: { code: "database_not_configured", message: "Configura las variables de Supabase en el API." } });
  const nomineeId = z.uuid().safeParse(req.params.nomineeId);
  if (!nomineeId.success) return res.status(400).json({ error: { code: "invalid_nominee_id", message: "El identificador del nominado no es válido." } });

  const editable = await editableNominee(nomineeId.data, req.account!);
  if (editable.error || !editable.nominee) return res.status(editable.status).json({ error: { code: "nominee_not_editable", message: editable.error } });
  const oldPath = editable.nominee.image_path;
  if (!oldPath) return res.json({ data: { imagePath: null, imageUrl: null } });

  const { error: updateError } = await databaseClient.from("nominees").update({ image_path: null }).eq("id", nomineeId.data);
  if (updateError) return res.status(500).json({ error: { code: "image_remove_failed", message: "No se pudo quitar la imagen del nominado." } });
  await databaseClient.from("ballots").update({ updated_at: new Date().toISOString() }).eq("id", editable.ballot.id);
  const { error: storageError } = await databaseClient.storage.from(bucket).remove([oldPath]);
  if (storageError) console.error("Nominee image cleanup is pending");
  return res.json({ data: { imagePath: null, imageUrl: null, cleanupPending: Boolean(storageError) } });
});

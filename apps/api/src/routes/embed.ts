import { Router } from "express";
import { z } from "zod";
import { config, hasSupabaseConfig } from "../config.js";
import { createEmbedToken } from "../lib/embed-token.js";
import { databaseClient } from "../supabase.js";

export const embedRouter = Router();

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value);
    if (url.origin !== value || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) return null;
    return url.origin;
  } catch { return null; }
}

embedRouter.get("/:publicId", async (req, res) => {
  if (!hasSupabaseConfig) return res.status(503).send();
  const publicId = z.uuid().safeParse(req.params.publicId);
  if (!publicId.success) return res.status(404).send();

  const { data: version, error: versionError } = await databaseClient.from("ballot_versions")
    .select("ballot_id,status").eq("public_id", publicId.data).maybeSingle();
  if (versionError || !version) return res.status(404).send();
  const { data: ballot, error: ballotError } = await databaseClient.from("ballots").select("event_id").eq("id", version.ballot_id).maybeSingle();
  if (ballotError || !ballot) return res.status(404).send();
  const { data: event, error: eventError } = await databaseClient.from("events")
    .select("allowed_embed_origins").eq("id", ballot.event_id).maybeSingle();
  if (eventError || !event) return res.status(404).send();

  let embedderOrigin = "";
  try { embedderOrigin = new URL(req.get("referer") ?? "").origin; } catch { /* missing or invalid referrer */ }
  const allowedOrigins = (event.allowed_embed_origins ?? []).flatMap((origin: string) => {
    const normalized = normalizeOrigin(origin);
    return normalized ? [normalized] : [];
  });
  if (!embedderOrigin || !allowedOrigins.includes(embedderOrigin)) return res.status(403).send();

  const webAppOrigin = normalizeOrigin(config.publicWebUrl);
  if (!webAppOrigin) return res.status(503).send();
  const token = createEmbedToken(publicId.data, embedderOrigin, config.supabaseServiceRoleKey);
  const innerHash = new URLSearchParams({ embedderOrigin, embedToken: token });
  const innerUrl = `${webAppOrigin}/widget/${publicId.data}#${innerHash.toString()}`;
  const allowedFrameAncestors = allowedOrigins.join(" ");
  res.removeHeader("X-Frame-Options");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  res.set("Content-Security-Policy", `default-src 'none'; style-src 'unsafe-inline'; frame-src ${webAppOrigin}; frame-ancestors ${allowedFrameAncestors}; base-uri 'none'; form-action 'none'`);
  res.set("Referrer-Policy", "no-referrer");
  res.set("Cache-Control", "no-store");
  res.type("html").send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Votación</title><style>html,body{width:100%;height:100%;margin:0}iframe{display:block;width:100%;height:100%;min-height:320px;border:0}</style></head><body><iframe src="${escapeHtml(innerUrl)}" title="Votación publicada" referrerpolicy="no-referrer"></iframe></body></html>`);
});

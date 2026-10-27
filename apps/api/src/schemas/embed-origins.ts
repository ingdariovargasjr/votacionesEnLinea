import { z } from "zod";

const embedOriginSchema = z.string().trim().min(1).max(255).url().transform((value, ctx) => {
  const url = new URL(value);
  const localDevelopmentHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    ctx.addIssue({ code: "custom", message: "Indica solo el origen, sin ruta, parámetros ni credenciales." });
    return z.NEVER;
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localDevelopmentHost)) {
    ctx.addIssue({ code: "custom", message: "Los dominios publicados deben usar HTTPS; HTTP solo se permite en localhost." });
    return z.NEVER;
  }
  return url.origin;
});

export const embedOriginsSchema = z.object({ origins: z.array(embedOriginSchema).max(20) }).strict()
  .superRefine(({ origins }, ctx) => {
    if (new Set(origins).size !== origins.length) ctx.addIssue({ code: "custom", message: "No repitas un dominio permitido." });
  });

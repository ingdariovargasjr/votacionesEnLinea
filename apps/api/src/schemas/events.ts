import { z } from "zod";

const nameSchema = z.string().trim().min(2).max(100);
const slugSchema = z.string().trim().min(2).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Usa minúsculas, números y guiones.");
const descriptionSchema = z.string().trim().max(500);
const timezoneSchema = z.string().trim().min(1).max(80).refine((value) => {
  try { new Intl.DateTimeFormat("es", { timeZone: value }); return true; }
  catch { return false; }
}, "Usa una zona horaria IANA válida, por ejemplo America/Mexico_City.");

export const createEventSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  description: descriptionSchema.default(""),
  timezone: timezoneSchema,
}).strict();

export const updateEventSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  description: descriptionSchema,
  timezone: timezoneSchema,
}).partial().strict().refine((value) => Object.keys(value).length > 0, "Indica al menos un campo para actualizar.");

export const eventIdSchema = z.uuid();

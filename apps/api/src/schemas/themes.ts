import { z } from "zod";

export const themeFontFamilies = ["DM Sans", "Manrope", "Arial", "Georgia", "system-ui"] as const;

const hexColorSchema = z.string().regex(/^#[\da-fA-F]{6}$/, "Usa un color HEX de seis dígitos, por ejemplo #c70d96.")
  .transform((value) => value.toLowerCase());

export const eventThemeSchema = z.object({
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  fontFamily: z.enum(themeFontFamilies),
}).strict();

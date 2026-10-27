import { z } from "zod";

export const socialConfirmationSchema = z.object({
  requirementIds: z.array(z.uuid().transform((value) => value.toLowerCase())).min(1).max(4),
}).strict().superRefine(({ requirementIds }, ctx) => {
  if (new Set(requirementIds).size !== requirementIds.length) {
    ctx.addIssue({ code: "custom", path: ["requirementIds"], message: "No repitas un requisito social." });
  }
});

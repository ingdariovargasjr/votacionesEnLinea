import { z } from "zod";

const ballotFields = {
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  votingMode: z.enum(["single_daily", "five_daily"]),
  socialProgramId: z.uuid().nullable().default(null),
};

export const createBallotSchema = z.object(ballotFields).strict();

export const updateBallotSchema = z.object({
  ...ballotFields,
  nominees: z.array(z.object({
    id: z.uuid().optional(),
    name: z.string().trim().min(2).max(100),
    eventFighterId: z.uuid().nullable().optional(),
  }).strict()).max(100)
    .superRefine((nominees, ctx) => {
      const ids = nominees.flatMap((nominee) => nominee.id ? [nominee.id] : []);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: "custom", message: "No repitas el identificador de un nominado." });
      }
    }),
}).strict();

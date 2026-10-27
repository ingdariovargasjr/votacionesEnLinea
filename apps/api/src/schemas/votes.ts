import { z } from "zod";

export const voteAssignmentSchema = z.object({
  nomineeId: z.uuid().transform((value) => value.toLowerCase()),
  quantity: z.number().int().min(0).max(5),
}).strict();

export const submitVoteSchema = z.object({
  idempotencyKey: z.uuid().transform((value) => value.toLowerCase()),
  assignments: z.array(voteAssignmentSchema).min(1).max(100),
}).strict().superRefine(({ assignments }, ctx) => {
  const nomineeIds = assignments.map((assignment) => assignment.nomineeId);
  if (new Set(nomineeIds).size !== nomineeIds.length) {
    ctx.addIssue({ code: "custom", path: ["assignments"], message: "No repitas un nominado en las asignaciones." });
  }
});

export function validateAssignmentsForBallot(
  assignments: z.infer<typeof voteAssignmentSchema>[],
  votingMode: "single_daily" | "five_daily",
  nomineeIds: Set<string>,
) {
  if (assignments.some(({ nomineeId }) => !nomineeIds.has(nomineeId))) return "nominee_not_in_published_version" as const;
  const selected = assignments.filter(({ quantity }) => quantity > 0);
  const total = selected.reduce((sum, item) => sum + item.quantity, 0);
  if (votingMode === "single_daily" && (selected.length !== 1 || total !== 1)) return "single_vote_requires_one_assignment" as const;
  if (votingMode === "five_daily" && total !== 5) return "five_votes_require_exactly_five" as const;
  return null;
}

import assert from "node:assert/strict";
import test from "node:test";
import { submitVoteSchema, validateAssignmentsForBallot } from "./votes.js";

const nomineeA = "07583680-ef0e-4bde-9082-c205bf7c7b8c";
const nomineeB = "b551c63b-05e2-4e23-8c48-94e8bb313c58";

test("validates distinct, nonnegative integer assignments", () => {
  const result = submitVoteSchema.safeParse({
    idempotencyKey: "75f0039a-303e-4f89-af25-9e615d50fc97",
    assignments: [{ nomineeId: nomineeA, quantity: 2 }, { nomineeId: nomineeB, quantity: 3 }],
  });
  assert.equal(result.success, true);
  assert.equal(submitVoteSchema.safeParse({ idempotencyKey: "75f0039a-303e-4f89-af25-9e615d50fc97", assignments: [{ nomineeId: nomineeA, quantity: -1 }] }).success, false);
  assert.equal(submitVoteSchema.safeParse({ idempotencyKey: "75f0039a-303e-4f89-af25-9e615d50fc97", assignments: [{ nomineeId: nomineeA, quantity: 1.5 }] }).success, false);
});

test("applies one-vote and exactly-five-vote rules and requires version nominees", () => {
  const ids = new Set([nomineeA, nomineeB]);
  assert.equal(validateAssignmentsForBallot([{ nomineeId: nomineeA, quantity: 1 }], "single_daily", ids), null);
  assert.equal(validateAssignmentsForBallot([{ nomineeId: nomineeA, quantity: 2 }], "single_daily", ids), "single_vote_requires_one_assignment");
  assert.equal(validateAssignmentsForBallot([{ nomineeId: nomineeA, quantity: 2 }, { nomineeId: nomineeB, quantity: 3 }], "five_daily", ids), null);
  assert.equal(validateAssignmentsForBallot([{ nomineeId: nomineeA, quantity: 4 }], "five_daily", ids), "five_votes_require_exactly_five");
  assert.equal(validateAssignmentsForBallot([{ nomineeId: "1cf84b0e-6e78-4eb2-9ed1-ecde7e573e8a", quantity: 1 }], "single_daily", ids), "nominee_not_in_published_version");
});

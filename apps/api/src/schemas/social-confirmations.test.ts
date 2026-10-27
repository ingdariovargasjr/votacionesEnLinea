import assert from "node:assert/strict";
import test from "node:test";
import { socialConfirmationSchema } from "./social-confirmations.js";

const first = "07583680-ef0e-4bde-9082-c205bf7c7b8c";
const second = "b551c63b-05e2-4e23-8c48-94e8bb313c58";

test("accepts a complete nonempty set of unique social requirement IDs", () => {
  const result = socialConfirmationSchema.safeParse({ requirementIds: [first, second] });
  assert.equal(result.success, true);
  assert.equal(socialConfirmationSchema.safeParse({ requirementIds: [first, first] }).success, false);
  assert.equal(socialConfirmationSchema.safeParse({ requirementIds: [] }).success, false);
  assert.equal(socialConfirmationSchema.safeParse({ requirementIds: [first], extra: true }).success, false);
});

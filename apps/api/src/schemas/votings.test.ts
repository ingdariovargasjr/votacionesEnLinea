import assert from "node:assert/strict";
import test from "node:test";
import { createBallotSchema, updateBallotSchema } from "./votings.js";

const nomineeA = "07583680-ef0e-4bde-9082-c205bf7c7b8c";
const nomineeB = "b551c63b-05e2-4e23-8c48-94e8bb313c58";
const fighterId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const programId = "1cf84b0e-6e78-4eb2-9ed1-ecde7e573e8a";

test("creates a ballot draft with normalized text and defaults", () => {
  const ballot = createBallotSchema.parse({ title: "  Gala favorita  ", votingMode: "single_daily" });

  assert.equal(ballot.title, "Gala favorita");
  assert.equal(ballot.description, "");
  assert.equal(ballot.socialProgramId, null);
});

test("accepts both voting modes and a UUID social program", () => {
  for (const votingMode of ["single_daily", "five_daily"] as const) {
    assert.equal(createBallotSchema.safeParse({ title: "Premio", votingMode, socialProgramId: programId }).success, true);
  }
});

test("updates a ballot with ordered nominees and optional fighter associations", () => {
  const result = updateBallotSchema.parse({
    title: "  Mejor gala  ",
    description: "  Elige a tus favoritos.  ",
    votingMode: "five_daily",
    socialProgramId: programId,
    nominees: [
      { id: nomineeA, name: "  Luchador A  ", eventFighterId: fighterId },
      { name: "Luchador B", eventFighterId: null },
    ],
  });

  assert.equal(result.title, "Mejor gala");
  assert.equal(result.description, "Elige a tus favoritos.");
  assert.deepEqual(result.nominees.map((nominee) => nominee.name), ["Luchador A", "Luchador B"]);
});

test("rejects malformed rules, social IDs, nominee IDs, duplicate IDs, and oversized lists", () => {
  const base = { title: "Premio", description: "", votingMode: "single_daily", socialProgramId: null, nominees: [] };

  assert.equal(updateBallotSchema.safeParse({ ...base, votingMode: "weekly" }).success, false);
  assert.equal(updateBallotSchema.safeParse({ ...base, socialProgramId: "not-a-uuid" }).success, false);
  assert.equal(updateBallotSchema.safeParse({ ...base, nominees: [{ id: "bad-id", name: "Nominado" }] }).success, false);
  assert.equal(updateBallotSchema.safeParse({ ...base, nominees: [{ id: nomineeA, name: "Uno" }, { id: nomineeA, name: "Dos" }] }).success, false);
  assert.equal(updateBallotSchema.safeParse({ ...base, nominees: Array.from({ length: 101 }, () => ({ name: "Nominado" })) }).success, false);
});

test("rejects unknown fields rather than accepting client-controlled data", () => {
  assert.equal(createBallotSchema.safeParse({ title: "Premio", votingMode: "single_daily", status: "published" }).success, false);
  assert.equal(updateBallotSchema.safeParse({ title: "Premio", votingMode: "single_daily", nominees: [], ownerId: nomineeA }).success, false);
});

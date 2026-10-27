import assert from "node:assert/strict";
import test from "node:test";
import { embedOriginsSchema } from "./embed-origins.js";

test("normalizes HTTPS embed origins and permits localhost development", () => {
  const result = embedOriginsSchema.parse({ origins: ["https://Awards.Example/", "http://localhost:5173"] });
  assert.deepEqual(result.origins, ["https://awards.example", "http://localhost:5173"]);
});

test("rejects paths, insecure public hosts, and duplicate origins", () => {
  assert.equal(embedOriginsSchema.safeParse({ origins: ["https://example.org/ballot"] }).success, false);
  assert.equal(embedOriginsSchema.safeParse({ origins: ["http://example.org"] }).success, false);
  assert.equal(embedOriginsSchema.safeParse({ origins: ["https://example.org", "https://example.org/"] }).success, false);
});

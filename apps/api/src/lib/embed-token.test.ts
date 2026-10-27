import assert from "node:assert/strict";
import test from "node:test";
import { createEmbedToken, verifyEmbedToken } from "./embed-token.js";

test("embed token is bound to a public voting and approved origin", () => {
  const now = 1_800_000_000_000;
  const token = createEmbedToken("public-id", "https://awards.example", "server-secret", now);
  assert.equal(verifyEmbedToken(token, "public-id", "https://awards.example", "server-secret", now), true);
  assert.equal(verifyEmbedToken(token, "another-id", "https://awards.example", "server-secret", now), false);
  assert.equal(verifyEmbedToken(token, "public-id", "https://evil.example", "server-secret", now), false);
  assert.equal(verifyEmbedToken(token, "public-id", "https://awards.example", "other-secret", now), false);
});

test("embed token expires and rejects malformed values", () => {
  const now = 1_800_000_000_000;
  const token = createEmbedToken("public-id", "https://awards.example", "server-secret", now);
  assert.equal(verifyEmbedToken(token, "public-id", "https://awards.example", "server-secret", now + 11 * 60_000), false);
  assert.equal(verifyEmbedToken("bad.token.extra", "public-id", "https://awards.example", "server-secret", now), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { imageHasExpectedSignature } from "./image-validation.js";

test("matches the declared MIME type to JPEG, PNG, and WebP signatures", () => {
  assert.equal(imageHasExpectedSignature(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"), true);
  assert.equal(imageHasExpectedSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"), true);
  assert.equal(imageHasExpectedSignature(Buffer.from("RIFF0000WEBP", "ascii"), "image/webp"), true);
  assert.equal(imageHasExpectedSignature(Buffer.from("not an image"), "image/png"), false);
  assert.equal(imageHasExpectedSignature(Buffer.from([0xff, 0xd8, 0xff]), "image/png"), false);
});

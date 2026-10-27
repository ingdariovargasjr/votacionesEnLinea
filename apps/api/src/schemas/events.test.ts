import assert from "node:assert/strict";
import test from "node:test";
import { createEventSchema, eventIdSchema, updateEventSchema } from "./events.js";

test("accepts a valid gala draft and applies optional description default", () => {
  const result = createEventSchema.parse({ name: "Premios ARL", slug: "premios-arl", timezone: "America/Mexico_City" });
  assert.equal(result.description, "");
});

test("rejects a duplicate-prone or malformed slug", () => {
  assert.equal(createEventSchema.safeParse({ name: "Gala ARL", slug: "Gala ARL!", timezone: "UTC" }).success, false);
});

test("rejects an unknown timezone", () => {
  assert.equal(createEventSchema.safeParse({ name: "Gala ARL", slug: "gala-arl", timezone: "Mars/Olympus" }).success, false);
});

test("requires at least one field when editing", () => {
  assert.equal(updateEventSchema.safeParse({}).success, false);
  assert.equal(updateEventSchema.safeParse({ name: "Gala de otoño" }).success, true);
  assert.equal(updateEventSchema.safeParse({ status: "published" }).success, false);
});

test("accepts only UUID event IDs", () => {
  assert.equal(eventIdSchema.safeParse("12345").success, false);
  assert.equal(eventIdSchema.safeParse("f47ac10b-58cc-4372-a567-0e02b2c3d479").success, true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { eventThemeSchema } from "./themes.js";

test("accepts the supported gala theme and normalizes HEX colors", () => {
  const theme = eventThemeSchema.parse({ primaryColor: "#C70D96", secondaryColor: "#E98CDB", fontFamily: "DM Sans" });
  assert.equal(theme.primaryColor, "#c70d96");
  assert.equal(theme.secondaryColor, "#e98cdb");
});

test("rejects arbitrary CSS, unsupported fonts, and unknown fields", () => {
  const base = { primaryColor: "#c70d96", secondaryColor: "#e98cdb", fontFamily: "DM Sans" };
  assert.equal(eventThemeSchema.safeParse({ ...base, primaryColor: "red" }).success, false);
  assert.equal(eventThemeSchema.safeParse({ ...base, fontFamily: "https://fonts.example/font.css" }).success, false);
  assert.equal(eventThemeSchema.safeParse({ ...base, customCss: "body { display:none }" }).success, false);
});

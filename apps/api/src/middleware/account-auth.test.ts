import assert from "node:assert/strict";
import test from "node:test";
import { canManageGalas } from "./account-auth.js";

test("superuser can manage galas on the free plan", () => {
  assert.equal(canManageGalas({ id: "1", email: "owner@example.com", role: "superuser", plan_code: "free", subscription_status: "free" }), true);
});

test("members need an active subscription to manage galas", () => {
  const member = { id: "2", email: "member@example.com", role: "member" as const, plan_code: null, subscription_status: "payment_required" as const };
  assert.equal(canManageGalas(member), false);
  assert.equal(canManageGalas({ ...member, subscription_status: "active" }), true);
});

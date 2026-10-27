import { createHmac, timingSafeEqual } from "node:crypto";

const tokenLifetimeSeconds = 10 * 60;

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createEmbedToken(publicId: string, embedderOrigin: string, secret: string, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + tokenLifetimeSeconds;
  const payload = `${publicId}\n${embedderOrigin}\n${expiresAt}`;
  return `${expiresAt}.${sign(payload, secret)}`;
}

export function verifyEmbedToken(token: string, publicId: string, embedderOrigin: string, secret: string, now = Date.now()) {
  const [expiresAtValue, actualSignature, ...extra] = token.split(".");
  if (!expiresAtValue || !actualSignature || extra.length || !/^\d+$/.test(expiresAtValue)) return false;
  const expiresAt = Number(expiresAtValue);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;
  const expectedSignature = sign(`${publicId}\n${embedderOrigin}\n${expiresAt}`, secret);
  const actual = Buffer.from(actualSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

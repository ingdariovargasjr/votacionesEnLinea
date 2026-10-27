import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

function signature(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export interface ParticipantIdentity {
  participantId: string;
  embedderOrigin: string;
}

export function createParticipantToken(embedderOrigin: string, secret: string, participantId: string = randomUUID()) {
  const identity = { version: 1, participantId, embedderOrigin };
  const encodedPayload = Buffer.from(JSON.stringify(identity)).toString("base64url");
  return { participantId, participantToken: `${encodedPayload}.${signature(encodedPayload, secret)}` };
}

export function verifyParticipantToken(token: string, secret: string): ParticipantIdentity | null {
  const [encodedPayload, actualSignature, ...extra] = token.split(".");
  if (!encodedPayload || !actualSignature || extra.length) return null;
  const expectedSignature = signature(encodedPayload, secret);
  const actual = Buffer.from(actualSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const identity = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<ParticipantIdentity> & { version?: number };
    if (identity.version !== 1 || typeof identity.participantId !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(identity.participantId)) return null;
    if (typeof identity.embedderOrigin !== "string") return null;
    const origin = new URL(identity.embedderOrigin);
    if (origin.origin !== identity.embedderOrigin) return null;
    return { participantId: identity.participantId, embedderOrigin: identity.embedderOrigin };
  } catch { return null; }
}
